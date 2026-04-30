import { createClient } from '@supabase/supabase-js'

function requiredEnv(name) {
  const v = process.env[name]
  if (!v || !String(v).trim()) {
    throw new Error(`Missing env ${name}`)
  }
  return String(v).trim()
}

function optionalEnv(name, fallback = '') {
  const v = process.env[name]
  return v == null ? fallback : String(v).trim()
}

function stripWrappingQuotes(s) {
  const v = String(s).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).trim()
  }
  return v
}

function normalizeSupabaseUrl(raw, envName) {
  const v0 = stripWrappingQuotes(raw)
  if (!v0) throw new Error(`Missing env ${envName}`)

  // Accept either full URL or a bare host like "supabase.example.com".
  const withScheme = /^https?:\/\//i.test(v0) ? v0 : `https://${v0}`
  try {
    // validate + normalize + strip trailing slash
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error(`Invalid protocol ${u.protocol}`)
    }
    return u.toString().replace(/\/$/, '')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid ${envName}: "${v0}". Expected http(s) URL. ${msg}`)
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchAll(supabase, table, select, pageSize = 1000) {
  const out = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(select).range(offset, offset + pageSize - 1)
    if (error) throw new Error(`[${table}] select failed: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
  }
  return out
}

async function upsertInBatches(supabase, table, rows, { onConflict, batchSize = 250 }) {
  let ok = 0
  let skipped = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).upsert(batch, { onConflict })
    if (!error) {
      ok += batch.length
      continue
    }

    // If one bad row breaks the whole batch (FK constraints etc) — retry row-by-row and skip failures.
    for (const row of batch) {
      const { error: rowErr } = await supabase.from(table).upsert([row], { onConflict })
      if (rowErr) {
        skipped += 1
        console.warn(`[${table}] skipped row`, {
          onConflict,
          error: rowErr.message,
          keys:
            table === 'push_subscriptions'
              ? { user_id: row.user_id, endpoint: row.endpoint }
              : { user_id: row.user_id, conversation_id: row.conversation_id },
        })
        // be polite to rate limits if there's repeated errors
        await sleep(30)
      } else {
        ok += 1
      }
    }
  }
  return { ok, skipped }
}

async function main() {
  const oldUrl = normalizeSupabaseUrl(requiredEnv('OLD_SUPABASE_URL'), 'OLD_SUPABASE_URL')
  const oldServiceKey = requiredEnv('OLD_SUPABASE_SERVICE_ROLE_KEY')
  const newUrl = normalizeSupabaseUrl(requiredEnv('NEW_SUPABASE_URL'), 'NEW_SUPABASE_URL')
  const newServiceKey = requiredEnv('NEW_SUPABASE_SERVICE_ROLE_KEY')

  const oldProjectRef = optionalEnv('OLD_SUPABASE_REF', 'old')
  const newProjectRef = optionalEnv('NEW_SUPABASE_REF', 'new')

  console.log(`[config] OLD_SUPABASE_URL=${oldUrl}`)
  console.log(`[config] NEW_SUPABASE_URL=${newUrl}`)

  const oldSb = createClient(oldUrl, oldServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const newSb = createClient(newUrl, newServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  console.log(`[${oldProjectRef}] fetching push_subscriptions...`)
  const pushSubs = await fetchAll(
    oldSb,
    'push_subscriptions',
    'id,user_id,endpoint,subscription,user_agent,created_at,updated_at',
  )
  console.log(`[${oldProjectRef}] fetched push_subscriptions: ${pushSubs.length}`)

  console.log(`[${oldProjectRef}] fetching chat_conversation_notification_mutes...`)
  const mutes = await fetchAll(
    oldSb,
    'chat_conversation_notification_mutes',
    'user_id,conversation_id,muted,created_at,updated_at',
  )
  console.log(`[${oldProjectRef}] fetched chat_conversation_notification_mutes: ${mutes.length}`)

  if (pushSubs.length === 0 && mutes.length === 0) {
    console.log('Nothing to migrate.')
    return
  }

  console.log(`[${newProjectRef}] upserting push_subscriptions...`)
  const pushRes = await upsertInBatches(newSb, 'push_subscriptions', pushSubs, {
    onConflict: 'user_id,endpoint',
    batchSize: 200,
  })
  console.log(`[${newProjectRef}] push_subscriptions migrated: ok=${pushRes.ok}, skipped=${pushRes.skipped}`)

  console.log(`[${newProjectRef}] upserting chat_conversation_notification_mutes...`)
  const mutesRes = await upsertInBatches(newSb, 'chat_conversation_notification_mutes', mutes, {
    onConflict: 'user_id,conversation_id',
    batchSize: 500,
  })
  console.log(
    `[${newProjectRef}] chat_conversation_notification_mutes migrated: ok=${mutesRes.ok}, skipped=${mutesRes.skipped}`,
  )

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

