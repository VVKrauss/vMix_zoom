import type { Pool } from 'pg'
import { ensureSelfDirectConversation } from './messengerLists.js'

async function usersAreMutualContacts(pool: Pool, a: string, b: string): Promise<boolean> {
  const r = await pool.query(
    `
    select
      exists(select 1 from public.user_favorites where user_id = $1 and favorite_user_id = $2) as a_to_b,
      exists(select 1 from public.user_favorites where user_id = $2 and favorite_user_id = $1) as b_to_a
    `,
    [a, b],
  )
  const row = r.rows[0] as any
  return row?.a_to_b === true && row?.b_to_a === true
}

export async function ensureDirectConversationWithUser(pool: Pool, args: { userId: string; targetUserId: string; targetTitle?: string | null }): Promise<string> {
  const me = args.userId
  const target = args.targetUserId.trim()
  const title = (args.targetTitle ?? '').trim().slice(0, 200) || null
  if (!target) throw Object.assign(new Error('target_user_required'), { statusCode: 400 })
  if (target === me) {
    return await ensureSelfDirectConversation(pool, me)
  }

  // DM privacy gate: dm_allow_from = contacts_only ⇒ need mutual favorites
  const pref = await pool.query<{ dm_allow_from: string | null }>(`select dm_allow_from from public.users where id = $1`, [target])
  const dmAllowFrom = (pref.rows[0]?.dm_allow_from ?? 'everyone').toString()
  if (dmAllowFrom === 'contacts_only') {
    const ok = await usersAreMutualContacts(pool, me, target)
    if (!ok) throw Object.assign(new Error('dm_not_allowed'), { statusCode: 403 })
  }

  // Enforce uniqueness at DB level using direct_conversation_pairs.
  // If concurrent requests race, the "loser" will delete its freshly created conversation and reuse the canonical one.
  const client = await pool.connect()
  try {
    await client.query('begin')

    const existing = await client.query<{ conversation_id: string }>(
      `
      select conversation_id
        from public.direct_conversation_pairs
       where user_a = least($1::uuid, $2::uuid)
         and user_b = greatest($1::uuid, $2::uuid)
       limit 1
      `,
      [me, target],
    )
    const found = existing.rows[0]?.conversation_id
    if (found) {
      if (title) await client.query(`update public.chat_conversations set title = coalesce(title, $2) where id = $1`, [found, title])
      await client.query('commit')
      return found
    }

    const created = await client.query<{ id: string }>(
      `insert into public.chat_conversations (id, kind, title, created_by, created_at, closed_at)
       values (gen_random_uuid(), 'direct', $2, $1, now(), null)
       returning id`,
      [me, title ?? 'Личный чат'],
    )
    const cid = created.rows[0]?.id
    if (!cid) throw new Error('create_conversation_failed')

    await client.query(
      `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
       values ($1, $2, 'owner', now()), ($1, $3, 'member', now())
       on conflict do nothing`,
      [cid, me, target],
    )

    const inserted = await client.query<{ conversation_id: string }>(
      `
      insert into public.direct_conversation_pairs (user_a, user_b, conversation_id)
      values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $3::uuid)
      on conflict (user_a, user_b) do nothing
      returning conversation_id
      `,
      [me, target, cid],
    )
    if (inserted.rowCount && inserted.rows[0]?.conversation_id) {
      await client.query('commit')
      return cid
    }

    // Another transaction created the canonical pair first. Reuse it and delete our extra conversation.
    const again = await client.query<{ conversation_id: string }>(
      `
      select conversation_id
        from public.direct_conversation_pairs
       where user_a = least($1::uuid, $2::uuid)
         and user_b = greatest($1::uuid, $2::uuid)
       limit 1
      `,
      [me, target],
    )
    const canonical = again.rows[0]?.conversation_id
    if (!canonical) throw new Error('direct_pair_missing_after_conflict')

    await client.query(`delete from public.chat_conversations where id = $1`, [cid])
    await client.query('commit')
    return canonical
  } catch (e) {
    try {
      await client.query('rollback')
    } catch {
      /* noop */
    }
    throw e
  } finally {
    client.release()
  }
}

