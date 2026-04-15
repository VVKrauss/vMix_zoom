/**
 * Web Push для личных сообщений (chat_messages, direct).
 *
 * Вызов: Database Webhook (INSERT на public.chat_messages) → POST на этот endpoint.
 * Секреты (Supabase Dashboard → Edge Functions → Secrets):
 *   WEBHOOK_PUSH_SECRET — тот же Bearer в настройках вебхука
 *   VAPID_SUBJECT        — например mailto:you@domain
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — пара VAPID (должна соответствовать VITE_VAPID_PUBLIC_KEY на клиенте)
 *   PUBLIC_APP_URL       — https://redflow.online (для ссылок в уведомлении)
 *
 * Dashboard → Database → Webhooks: таблица chat_messages, INSERT,
 *   URL: https://<ref>.supabase.co/functions/v1/send-dm-webpush
 *   Header: Authorization: Bearer <WEBHOOK_PUSH_SECRET>
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webPush from 'npm:web-push@3.6.6'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function verifyBearer(req: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const h = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return !!m && m[1] === secret
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/** Корень JSON: иногда вебхук кладёт событие во вложенный объект. */
function unwrapRoot(raw: Record<string, unknown>): Record<string, unknown> {
  const payload = raw.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>
  }
  return raw
}

/**
 * Стандартный Database Webhook Supabase: type, table, record.
 * type сравниваем без учёта регистра.
 */
function parseChatMessageInsert(
  root: Record<string, unknown>,
): { record: Record<string, unknown> } | null {
  const tableRaw = typeof root.table === 'string' ? root.table.trim() : ''
  const typeRaw = typeof root.type === 'string' ? root.type.trim() : ''
  const table = tableRaw.replace(/^public\./, '')
  if (table !== 'chat_messages') return null
  if (typeRaw.toUpperCase() !== 'INSERT') return null

  const record = root.record
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  return { record: record as Record<string, unknown> }
}

/** Объект подписки для npm:web-push (как у PushSubscription.toJSON()). */
function toWebPushSubscription(
  raw: unknown,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const endpoint = typeof o.endpoint === 'string' ? o.endpoint.trim() : ''
  const keys = o.keys
  if (!endpoint || !keys || typeof keys !== 'object' || Array.isArray(keys)) return null
  const k = keys as Record<string, unknown>
  const p256dh = typeof k.p256dh === 'string' ? k.p256dh.trim() : ''
  const auth = typeof k.auth === 'string' ? k.auth.trim() : ''
  if (!p256dh || !auth) return null
  return { endpoint, keys: { p256dh, auth } }
}

function endpointHint(endpoint: string): string {
  if (endpoint.length <= 48) return endpoint
  return `${endpoint.slice(0, 40)}…`
}

function readWebPushError(e: unknown): { statusCode: number; message: string } {
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    const statusCode = typeof o.statusCode === 'number' ? o.statusCode : 0
    const body = typeof o.body === 'string' ? o.body : ''
    const msg = e instanceof Error ? e.message : String(o.message ?? 'send_failed')
    return { statusCode, message: body || msg }
  }
  return { statusCode: 0, message: e instanceof Error ? e.message : 'send_failed' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const webhookSecret = Deno.env.get('WEBHOOK_PUSH_SECRET')
  if (!verifyBearer(req, webhookSecret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidSubject || !vapidPublic || !vapidPrivate) {
    return json({ error: 'vapid_not_configured' }, 500)
  }

  webPush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let rawBody: Record<string, unknown>
  try {
    rawBody = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const root = unwrapRoot(rawBody)
  const parsed = parseChatMessageInsert(root)
  if (!parsed) {
    return json({ ok: true, skipped: 'not_chat_messages_insert' })
  }

  const record = parsed.record

  const kind = typeof record.kind === 'string' ? record.kind : 'text'
  if (kind === 'reaction' || kind === 'system') {
    return json({ ok: true, skipped: `kind_${kind}` })
  }

  const conversationId =
    typeof record.conversation_id === 'string' ? record.conversation_id.trim() : ''
  const senderId =
    typeof record.sender_user_id === 'string' ? record.sender_user_id.trim() : ''
  if (!conversationId || !senderId) {
    return json({ ok: true, skipped: 'missing_ids' })
  }

  const { data: conv, error: convErr } = await admin
    .from('chat_conversations')
    .select('kind')
    .eq('id', conversationId)
    .maybeSingle()

  if (convErr || !conv || (conv as { kind?: string }).kind !== 'direct') {
    return json({ ok: true, skipped: 'not_direct' })
  }

  let bodyText = typeof record.body === 'string' ? record.body : ''
  if (kind === 'image' && !bodyText.trim()) bodyText = `${'\u{1F4F7}'} Фото`

  const senderName =
    typeof record.sender_name_snapshot === 'string' && record.sender_name_snapshot.trim()
      ? record.sender_name_snapshot.trim()
      : 'Сообщение'

  const { data: senderRow } = await admin
    .from('users')
    .select('avatar_url')
    .eq('id', senderId)
    .maybeSingle()
  const senderAvatar =
    senderRow && typeof (senderRow as { avatar_url?: unknown }).avatar_url === 'string'
      ? ((senderRow as { avatar_url?: string }).avatar_url ?? '').trim()
      : ''

  const { data: members, error: memErr } = await admin
    .from('chat_conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', senderId)

  if (memErr || !members?.length) {
    return json({ ok: true, skipped: 'no_recipients', detail: memErr?.message })
  }

  const recipientIds = members
    .map((m: { user_id?: string }) => (typeof m.user_id === 'string' ? m.user_id : ''))
    .filter(Boolean)

  if (recipientIds.length === 0) return json({ ok: true, skipped: 'empty_recipients' })

  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('id, user_id, subscription')
    .in('user_id', recipientIds)

  if (subErr) return json({ error: 'subs_query', detail: subErr.message }, 500)
  if (!subs?.length) return json({ ok: true, sent: 0, note: 'no_subscriptions' })

  const appBase = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://redflow.online').replace(/\/$/, '')
  const openPath = `/dashboard/messenger?chat=${encodeURIComponent(conversationId)}`
  const defaultIcon = `${appBase}/logo.png`
  const payload = JSON.stringify({
    title: truncate(senderName, 60),
    body: truncate(bodyText, 140),
    url: `${appBase}${openPath}`,
    tag: `dm-${conversationId}`,
    conversationId,
    icon: senderAvatar || defaultIcon,
    badge: defaultIcon,
  })

  let sent = 0
  let removed = 0
  let skippedBadSubscription = 0
  let failed = 0
  const failures: { subscription_id: string; status_code: number; endpoint: string; detail: string }[] = []

  for (const row of subs as { id: string; user_id: string; subscription: unknown }[]) {
    const subObj = toWebPushSubscription(row.subscription)
    if (!subObj) {
      skippedBadSubscription += 1
      console.warn('[send-dm-webpush] invalid subscription json', { id: row.id })
      continue
    }

    try {
      await webPush.sendNotification(subObj, payload, {
        TTL: 86_400,
      })
      sent += 1
    } catch (e: unknown) {
      const { statusCode, message } = readWebPushError(e)
      console.error('[send-dm-webpush] send failed', {
        subscription_id: row.id,
        status_code: statusCode,
        endpoint: endpointHint(subObj.endpoint),
        detail: truncate(message, 200),
      })

      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
        removed += 1
      } else {
        failed += 1
        if (failures.length < 8) {
          failures.push({
            subscription_id: row.id,
            status_code: statusCode,
            endpoint: endpointHint(subObj.endpoint),
            detail: truncate(message, 120),
          })
        }
      }
    }
  }

  return json({
    ok: true,
    sent,
    removed_invalid: removed,
    skipped_bad_subscription: skippedBadSubscription,
    failed,
    ...(failures.length ? { failures } : {}),
  })
})
