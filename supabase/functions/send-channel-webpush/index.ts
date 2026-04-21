/**
 * Web Push для каналов (chat_messages, kind=channel).
 *
 * Вызов: Database Webhook (INSERT на public.chat_messages) → POST на этот endpoint.
 * Секреты (Supabase Dashboard → Edge Functions → Secrets):
 *   WEBHOOK_PUSH_SECRET — тот же Bearer в настройках вебхука
 *   VAPID_SUBJECT        — например mailto:you@domain
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — пара VAPID (должна соответствовать VITE_VAPID_PUBLIC_KEY на клиенте)
 *   PUBLIC_APP_URL       — https://redflow.online (для ссылок в уведомлении)
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

function unwrapRoot(raw: Record<string, unknown>): Record<string, unknown> {
  const payload = raw.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload as Record<string, unknown>
  return raw
}

function parseChatMessageInsert(root: Record<string, unknown>): { record: Record<string, unknown> } | null {
  const tableRaw = typeof root.table === 'string' ? root.table.trim() : ''
  const typeRaw =
    (typeof root.type === 'string' ? root.type.trim() : '') ||
    (typeof root.eventType === 'string' ? root.eventType.trim() : '')
  const table = tableRaw.replace(/^public\./, '')
  if (table !== 'chat_messages') return null
  if (typeRaw.toUpperCase() !== 'INSERT') return null
  const record = root.record
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null
  return { record: record as Record<string, unknown> }
}

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

function parseMentionSlugs(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /@([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)/g
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? '').trim().toLowerCase()
    if (!raw || seen.has(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  return out
}

async function signedMessengerMediaUrl(
  admin: ReturnType<typeof createClient>,
  path: string | null | undefined,
): Promise<string> {
  const p = typeof path === 'string' ? path.trim() : ''
  if (!p) return ''
  const { data, error } = await admin.storage.from('messenger-media').createSignedUrl(p, 86_400)
  if (error || !data?.signedUrl) return ''
  return data.signedUrl
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const webhookSecret = Deno.env.get('WEBHOOK_PUSH_SECRET')
  if (!verifyBearer(req, webhookSecret)) return json({ error: 'unauthorized' }, 401)
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidSubject || !vapidPublic || !vapidPrivate) return json({ error: 'vapid_not_configured' }, 500)
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
  if (!parsed) return json({ ok: true, skipped: 'not_chat_messages_insert' })

  const record = parsed.record
  const kind = typeof record.kind === 'string' ? record.kind : 'text'
  if (kind === 'reaction' || kind === 'system') return json({ ok: true, skipped: `kind_${kind}` })

  const conversationId = typeof record.conversation_id === 'string' ? record.conversation_id.trim() : ''
  const senderId = typeof record.sender_user_id === 'string' ? record.sender_user_id.trim() : ''
  const messageId = typeof record.id === 'string' ? record.id.trim() : ''
  if (!conversationId || !senderId) return json({ ok: true, skipped: 'missing_ids' })

  const { data: conv, error: convErr } = await admin
    .from('chat_conversations')
    .select('kind, title, avatar_path, avatar_thumb_path')
    .eq('id', conversationId)
    .maybeSingle()
  if (convErr || !conv || (conv as { kind?: string }).kind !== 'channel') return json({ ok: true, skipped: 'not_channel' })

  const channelTitle = typeof (conv as { title?: unknown }).title === 'string' ? String((conv as { title?: string }).title).trim() : 'Канал'

  let bodyText = typeof record.body === 'string' ? record.body : ''
  if (kind === 'image' && !bodyText.trim()) bodyText = `${'\u{1F4F7}'} Фото`
  if (kind === 'audio' && !bodyText.trim()) bodyText = `${'\u{1F3A4}'} Голосовое`

  const senderName = typeof record.sender_name_snapshot === 'string' && record.sender_name_snapshot.trim()
    ? record.sender_name_snapshot.trim()
    : 'Сообщение'

  const { data: senderRow } = await admin.from('users').select('avatar_url').eq('id', senderId).maybeSingle()
  const senderAvatar =
    senderRow && typeof (senderRow as { avatar_url?: unknown }).avatar_url === 'string'
      ? ((senderRow as { avatar_url?: string }).avatar_url ?? '').trim()
      : ''

  const cv = conv as { avatar_path?: unknown; avatar_thumb_path?: unknown }
  const channelPathRaw =
    (typeof cv.avatar_thumb_path === 'string' && cv.avatar_thumb_path.trim()
      ? cv.avatar_thumb_path
      : null) ??
    (typeof cv.avatar_path === 'string' && cv.avatar_path.trim() ? cv.avatar_path : null)
  const channelIconSigned = channelPathRaw ? await signedMessengerMediaUrl(admin, channelPathRaw) : ''
  const displayIconUrl = channelIconSigned || senderAvatar

  const { data: members, error: memErr } = await admin
    .from('chat_conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .neq('user_id', senderId)
  if (memErr || !members?.length) return json({ ok: true, skipped: 'no_recipients', detail: memErr?.message })

  const recipientIds = members
    .map((m: { user_id?: string }) => (typeof m.user_id === 'string' ? m.user_id : ''))
    .filter(Boolean)
  if (recipientIds.length === 0) return json({ ok: true, skipped: 'empty_recipients' })

  // Mentions: отдельный push, игнорируя mute. Источник — таблица chat_message_mentions (пишется триггером).
  let mentionRecipientIds: string[] = []
  if (messageId) {
    const { data: mentionRows } = await admin
      .from('chat_message_mentions')
      .select('user_id')
      .eq('message_id', messageId)
    const ids = (Array.isArray(mentionRows) ? mentionRows : [])
      .map((r: { user_id?: string }) => (typeof r.user_id === 'string' ? r.user_id : ''))
      .filter(Boolean)
    if (ids.length > 0) {
      const s = new Set(ids)
      mentionRecipientIds = [...s].filter((id) => id !== senderId)
    }
  } else {
    const body = typeof record.body === 'string' ? record.body : ''
    const slugs = parseMentionSlugs(body)
    if (slugs.length > 0) {
      const { data: usersBySlug } = await admin
        .from('users')
        .select('id, profile_slug')
        .in('profile_slug', slugs)
      const ids = (Array.isArray(usersBySlug) ? usersBySlug : [])
        .map((u: { id?: string }) => (typeof u.id === 'string' ? u.id : ''))
        .filter(Boolean)
      const memSet = new Set(recipientIds)
      mentionRecipientIds = ids.filter((id) => memSet.has(id) && id !== senderId)
    }
  }

  const { data: mutedRows } = await admin
    .from('chat_conversation_notification_mutes')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('muted', true)
    .in('user_id', recipientIds)

  const mutedSet = new Set(
    (Array.isArray(mutedRows) ? mutedRows : [])
      .map((r: { user_id?: string }) => (typeof r.user_id === 'string' ? r.user_id : ''))
      .filter(Boolean),
  )

  const mentionSet = new Set(mentionRecipientIds)
  const nonMentionRecipients = recipientIds.filter((id) => !mentionSet.has(id))
  const finalRecipientIds = mutedSet.size > 0 ? nonMentionRecipients.filter((id) => !mutedSet.has(id)) : nonMentionRecipients
  if (finalRecipientIds.length === 0) return json({ ok: true, skipped: 'all_muted' })

  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('id, user_id, subscription')
    .in('user_id', finalRecipientIds)
  if (subErr) return json({ error: 'subs_query', detail: subErr.message }, 500)
  if (!subs?.length) return json({ ok: true, sent: 0, note: 'no_subscriptions' })

  const appBase = (Deno.env.get('PUBLIC_APP_URL') ?? 'https://redflow.online').replace(/\/$/, '')
  const openPath = `/dashboard/messenger?chat=${encodeURIComponent(conversationId)}`
  const defaultIcon = `${appBase}/logo.png`
  const defaultBadge = `${appBase}/push-badge.png`
  const payload = JSON.stringify({
    title: truncate(channelTitle, 60),
    body: truncate(`${senderName}: ${bodyText}`, 140),
    url: `${appBase}${openPath}`,
    tag: `ch-${conversationId}`,
    conversationId,
    conversationKind: 'channel',
    icon: displayIconUrl || defaultIcon,
    badge: defaultBadge,
  })

  let sent = 0
  let removed = 0
  let failed = 0
  let skippedBadSubscription = 0

  for (const row of subs as { id: string; subscription: unknown }[]) {
    const subObj = toWebPushSubscription(row.subscription)
    if (!subObj) {
      skippedBadSubscription += 1
      continue
    }
    try {
      await webPush.sendNotification(subObj, payload, { TTL: 86_400, urgency: 'high' })
      sent += 1
    } catch (e: unknown) {
      const { statusCode } = readWebPushError(e)
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
        removed += 1
      } else {
        failed += 1
      }
    }
  }

  // Mentions push (override mute): отдельный payload "Вас упомянули".
  let mentionSent = 0
  let mentionRemoved = 0
  let mentionSkippedBadSubscription = 0
  let mentionFailed = 0
  if (mentionRecipientIds.length > 0) {
    const { data: mentionSubs, error: mentionSubErr } = await admin
      .from('push_subscriptions')
      .select('id, user_id, subscription')
      .in('user_id', mentionRecipientIds)
    if (!mentionSubErr && mentionSubs?.length) {
      const mentionPayload = JSON.stringify({
        title: truncate('Вас упомянули', 60),
        body: truncate(`${senderName}: ${bodyText}`, 140),
        url: `${appBase}${openPath}`,
        tag: `mention-${conversationId}`,
        conversationId,
        conversationKind: 'channel',
        icon: displayIconUrl || defaultIcon,
        badge: defaultBadge,
      })
      for (const row of mentionSubs as { id: string; subscription: unknown }[]) {
        const subObj = toWebPushSubscription(row.subscription)
        if (!subObj) {
          mentionSkippedBadSubscription += 1
          continue
        }
        try {
          await webPush.sendNotification(subObj, mentionPayload, { TTL: 86_400, urgency: 'high' })
          mentionSent += 1
        } catch (e: unknown) {
          const { statusCode } = readWebPushError(e)
          if (statusCode === 404 || statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('id', row.id)
            mentionRemoved += 1
          } else {
            mentionFailed += 1
          }
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
    ...(mentionRecipientIds.length
      ? {
          mention_sent: mentionSent,
          mention_removed_invalid: mentionRemoved,
          mention_skipped_bad_subscription: mentionSkippedBadSubscription,
          mention_failed: mentionFailed,
          mention_recipients: mentionRecipientIds.length,
        }
      : {}),
  })
})

