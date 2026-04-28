import { fetchJson } from './http'
import { realtime } from './realtime'

export type V1ConversationLists = {
  direct: unknown[]
  groups: unknown[]
  channels: unknown[]
}

let cachedSelfDirectId: string | null = null
let cachedSelfDirectAtMs = 0

export async function v1ListMyGroups(): Promise<{ data: unknown[] | null; error: string | null }> {
  const r = await v1GetMyConversations()
  if (r.error || !r.data) return { data: null, error: r.error }
  return { data: r.data.groups, error: null }
}

export async function v1ListMyChannels(): Promise<{ data: unknown[] | null; error: string | null }> {
  const r = await v1GetMyConversations()
  if (r.error || !r.data) return { data: null, error: r.error }
  return { data: r.data.channels, error: null }
}

export async function v1GetMyConversations(): Promise<{ data: V1ConversationLists | null; error: string | null }> {
  const r = await fetchJson<V1ConversationLists>('/api/v1/me/conversations', { method: 'GET', auth: true })
  if (!r.ok) return { data: null, error: r.error.message }
  const direct = Array.isArray((r.data as any)?.direct) ? (r.data as any).direct : []
  const groups = Array.isArray((r.data as any)?.groups) ? (r.data as any).groups : []
  const channels = Array.isArray((r.data as any)?.channels) ? (r.data as any).channels : []
  return { data: { direct, groups, channels }, error: null }
}

export async function v1EnsureSelfDirectConversation(): Promise<{ data: string | null; error: string | null }> {
  // Cache to avoid repeated roundtrips on flaky networks (RU).
  // Note: server guarantees the same conversation id for the user.
  const now = Date.now()
  if (cachedSelfDirectId && now - cachedSelfDirectAtMs < 10 * 60_000) {
    return { data: cachedSelfDirectId, error: null }
  }
  const r = await fetchJson<{ conversationId: string }>('/api/v1/me/conversations/self-direct', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
    timeoutMs: 7_000,
    retry: { retries: 2, baseDelayMs: 300 },
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const id = typeof (r.data as any)?.conversationId === 'string' ? (r.data as any).conversationId : null
  if (id) {
    cachedSelfDirectId = id
    cachedSelfDirectAtMs = now
  }
  return { data: id, error: null }
}

export type V1DirectMessageRow = Record<string, unknown>

export async function v1ListConversationMessagesPage(args: {
  conversationId: string
  limit: number
  before?: { createdAt: string; id: string } | null
}): Promise<{ data: { messages: V1DirectMessageRow[]; hasMoreOlder: boolean } | null; error: string | null }> {
  const cid = args.conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const qs = new URLSearchParams()
  qs.set('limit', String(args.limit))
  if (args.before?.createdAt) qs.set('beforeCreatedAt', args.before.createdAt)
  if (args.before?.id) qs.set('beforeId', args.before.id)

  const r = await fetchJson<{ messages: V1DirectMessageRow[]; hasMoreOlder: boolean }>(
    `/api/v1/conversations/${encodeURIComponent(cid)}/messages?${qs.toString()}`,
    { method: 'GET', auth: true },
  )
  if (!r.ok) return { data: null, error: r.error.message }
  const messages = Array.isArray((r.data as any)?.messages) ? ((r.data as any).messages as V1DirectMessageRow[]) : []
  const hasMoreOlder = (r.data as any)?.hasMoreOlder === true
  return { data: { messages, hasMoreOlder }, error: null }
}

export async function v1MarkConversationRead(conversationId: string): Promise<{ data: unknown | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const r = await fetchJson<{ data: unknown }>(`/api/v1/conversations/${encodeURIComponent(cid)}/read`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1AppendConversationMessage(args: {
  conversationId: string
  body: string
  kind: 'text' | 'system' | 'image' | 'audio'
  meta?: unknown | null
  replyToMessageId?: string | null
  quoteToMessageId?: string | null
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }

  const disableWs = String(import.meta.env.VITE_MESSENGER_DISABLE_WS ?? '').trim() === '1'

  // WS-first: avoids new HTTP requests on flaky networks (RU).
  // Fallback to HTTP if WS is not open or ack doesn't arrive quickly.
  if (!disableWs && realtime.isOpen()) {
    const clientId =
      (globalThis.crypto as any)?.randomUUID?.() ?? `c_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const startedAt = Date.now()
    const timeoutMs = 2500
    const p = new Promise<{ data: any | null; error: string | null }>((resolve) => {
      let done = false
      const off = realtime.onAny((msg) => {
        if (done) return
        if (!msg || typeof msg !== 'object') return
        const t = String((msg as any).type ?? '')
        if (t !== 'message_ack' && t !== 'ack') return
        if (String((msg as any).clientId ?? '') !== clientId) return
        done = true
        window.clearTimeout(timer)
        off()
        if ((msg as any).ok === true) resolve({ data: msg, error: null })
        else resolve({ data: msg, error: String((msg as any).error?.message ?? (msg as any).error ?? 'send_failed') })
      })
      const timer = window.setTimeout(() => {
        if (done) return
        done = true
        off()
        resolve({ data: null, error: 'ws_ack_timeout' })
      }, timeoutMs)

      realtime.send({
        type: 'send_message',
        conversationId: cid,
        body: args.body,
        kind: args.kind,
        meta: args.meta ?? null,
        replyToMessageId: args.replyToMessageId ?? null,
        quoteToMessageId: args.quoteToMessageId ?? null,
        clientId,
        clientAtMs: startedAt,
      })
    })
    const ack = await p
    if (!ack.error) return ack
    // fall through to HTTP
  }

  const r = await fetchJson<{ data: unknown }>(`/api/v1/conversations/${encodeURIComponent(cid)}/messages`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({
      body: args.body,
      kind: args.kind,
      meta: args.meta ?? null,
      replyToMessageId: args.replyToMessageId ?? null,
      quoteToMessageId: args.quoteToMessageId ?? null,
    }),
    timeoutMs: 7_000,
    retry: { retries: 2, baseDelayMs: 300 },
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1ToggleConversationReaction(args: {
  conversationId: string
  targetMessageId: string
  emoji: string
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const r = await fetchJson<{ data: unknown }>(`/api/v1/conversations/${encodeURIComponent(cid)}/reactions`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetMessageId: args.targetMessageId, emoji: args.emoji }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1EditConversationMessage(args: {
  conversationId: string
  messageId: string
  newBody: string
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  if (!cid || !mid) return { data: null, error: 'conversation_required' }
  const r = await fetchJson<{ data: unknown }>(
    `/api/v1/conversations/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`,
    { method: 'PATCH', auth: true, body: JSON.stringify({ newBody: args.newBody }) },
  )
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1DeleteConversationMessage(args: {
  conversationId: string
  messageId: string
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  if (!cid || !mid) return { data: null, error: 'conversation_required' }
  const r = await fetchJson<{ data: unknown }>(
    `/api/v1/conversations/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`,
    { method: 'DELETE', auth: true },
  )
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1EnsureDirectConversationWithUser(args: {
  targetUserId: string
  targetTitle?: string | null
}): Promise<{ data: string | null; error: string | null }> {
  const id = args.targetUserId.trim()
  if (!id) return { data: null, error: 'target_user_required' }
  const r = await fetchJson<{ conversationId: string }>('/api/v1/me/conversations/direct-with-user', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetUserId: id, targetTitle: args.targetTitle ?? null }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const cid = typeof (r.data as any)?.conversationId === 'string' ? (r.data as any).conversationId : null
  return { data: cid, error: null }
}

export async function v1GetDirectPeerReceiptContext(conversationId: string): Promise<{ data: unknown | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const r = await fetchJson<{ data: unknown }>(
    `/api/v1/conversations/${encodeURIComponent(cid)}/direct-peer-receipt-context`,
    { method: 'GET', auth: true },
  )
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

