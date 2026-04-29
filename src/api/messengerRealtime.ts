import { realtime } from './realtime'

export type ThreadKind = 'direct' | 'group' | 'channel'

export type WsAckOk = { type: 'ack'; clientId: string; ok: true; data?: unknown }
export type WsAckFail = { type: 'ack'; clientId: string; ok: false; error: { message: string; details?: unknown } }
export type WsAck = WsAckOk | WsAckFail

export type ThreadMessage = {
  id: string
  conversationId: string
  senderUserId: string | null
  kind: 'text' | 'system' | 'reaction' | 'image' | 'audio'
  body: string
  createdAt: string
  editedAt?: string | null
  replyToMessageId?: string | null
  quoteToMessageId?: string | null
  meta?: any | null
}

export type ThreadEvent =
  | { type: 'message_created'; message: ThreadMessage }
  | { type: 'message_updated'; message: ThreadMessage }
  | { type: 'message_deleted'; conversationId: string; messageId: string }
  | { type: 'thread_tail_updated'; conversationId: string; lastMessageAt: string | null; lastMessagePreview: string | null; messageCountDelta?: number }

export type UserFeedEvent =
  | {
      type: 'bg_message'
      conversationId: string
      senderUserId: string | null
      kind: string
      body: string
      createdAt: string
      replyToMessageId?: string | null
    }
  | { type: 'unread_invalidate'; userId: string }
  | { type: 'membership_changed'; userId: string; conversationId: string | null; action: string }

export function threadChannel(conversationId: string): string {
  return `thread:${conversationId.trim()}`
}

export function userFeedChannel(userId: string): string {
  return `messenger-user:${userId.trim()}`
}

export function subscribeThread(conversationId: string, onEvent: (e: ThreadEvent) => void): () => void {
  const ch = threadChannel(conversationId)
  const base = realtime.channel(ch)
  const off = base.on((e) => {
    if (e.type !== 'broadcast') return
    const ev = String((e as any).event ?? '').trim()
    const p = (e as any).payload
    if (ev === 'message_created' && p?.message) onEvent({ type: 'message_created', message: p.message })
    else if (ev === 'message_updated' && p?.message) onEvent({ type: 'message_updated', message: p.message })
    else if (ev === 'message_deleted' && p?.conversationId && p?.messageId)
      onEvent({ type: 'message_deleted', conversationId: String(p.conversationId), messageId: String(p.messageId) })
    else if (ev === 'thread_tail_updated' && p?.conversationId)
      onEvent({
        type: 'thread_tail_updated',
        conversationId: String(p.conversationId),
        lastMessageAt: (p.lastMessageAt ?? null) as any,
        lastMessagePreview: (p.lastMessagePreview ?? null) as any,
        messageCountDelta: typeof p.messageCountDelta === 'number' ? p.messageCountDelta : undefined,
      })
  })
  base.subscribe()
  return () => {
    try {
      off()
    } catch {
      /* noop */
    }
    base.unsubscribe()
  }
}

export function subscribeUserFeed(userId: string, onEvent: (e: UserFeedEvent) => void): () => void {
  const ch = userFeedChannel(userId)
  const base = realtime.channel(ch)
  const off = base.on((e) => {
    if (e.type !== 'broadcast') return
    const ev = String((e as any).event ?? '').trim()
    const p = (e as any).payload
    if (ev === 'bg_message' && p?.conversationId) {
      onEvent({
        type: 'bg_message',
        conversationId: String(p.conversationId),
        senderUserId: typeof p.senderUserId === 'string' ? p.senderUserId : null,
        kind: String(p.kind ?? ''),
        body: String(p.body ?? ''),
        createdAt: String(p.createdAt ?? ''),
        replyToMessageId: typeof p.replyToMessageId === 'string' ? p.replyToMessageId : null,
      })
      return
    }
    if (ev === 'unread_invalidate') {
      onEvent({ type: 'unread_invalidate', userId })
      return
    }
    if (ev === 'membership_changed') {
      onEvent({
        type: 'membership_changed',
        userId,
        conversationId: typeof p?.conversationId === 'string' ? p.conversationId : null,
        action: String(p?.action ?? ''),
      })
    }
  })
  base.subscribe()
  return () => {
    try {
      off()
    } catch {
      /* noop */
    }
    base.unsubscribe()
  }
}

