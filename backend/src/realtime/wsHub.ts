import type { Pool } from 'pg'
import { WebSocketServer } from 'ws'
import { appendDirectMessage, markDirectConversationRead, toggleDirectMessageReaction } from '../domain/directMessageMutations.js'

type WsClient = {
  userId: string
  ws: import('ws').WebSocket
  channels: Set<string>
}

export type DbChangeAction = 'INSERT' | 'UPDATE' | 'DELETE'

export type WsHub = {
  wss: WebSocketServer
  clients: Set<WsClient>
  broadcastDbChange: (channel: string, table: string, action: DbChangeAction, row: unknown) => void
  broadcastTyped: (channel: string, event: string, payload: unknown) => void
  threadChannel: (conversationId: string) => string
  userFeedChannel: (userId: string) => string
  mapMessageForClient: (row: Record<string, unknown>) => any
  previewForMessage: (row: Record<string, unknown>) => string
  handleUpgrade: (req: any, socket: any, head: any, userId: string) => void
}

// Dedup: (userId -> clientId -> ack payload) for short TTL.
const wsAckCache = new Map<string, Map<string, { atMs: number; payload: any }>>()
function cacheAck(userId: string, clientId: string, payload: any) {
  const now = Date.now()
  const perUser = wsAckCache.get(userId) ?? new Map()
  perUser.set(clientId, { atMs: now, payload })
  wsAckCache.set(userId, perUser)
  // best-effort cleanup
  for (const [cid, v] of perUser) {
    if (now - v.atMs > 5 * 60_000) perUser.delete(cid)
  }
  if (perUser.size > 200) {
    const entries = Array.from(perUser.entries()).sort((a, b) => a[1].atMs - b[1].atMs)
    for (const [cid] of entries.slice(0, Math.max(0, entries.length - 200))) perUser.delete(cid)
  }
}
function getCachedAck(userId: string, clientId: string): any | null {
  const perUser = wsAckCache.get(userId)
  if (!perUser) return null
  const v = perUser.get(clientId)
  if (!v) return null
  if (Date.now() - v.atMs > 5 * 60_000) {
    perUser.delete(clientId)
    return null
  }
  return v.payload
}

async function assertCanPostToConversation(pool: Pool, conversationId: string, userId: string, msg: any): Promise<void> {
  const cid = conversationId.trim()
  const r = await pool.query<{
    kind: string
    closed_at: string | null
    channel_posting_mode: string | null
    channel_comments_mode: string | null
  }>(
    `select kind, closed_at, channel_posting_mode, channel_comments_mode
       from public.chat_conversations
      where id=$1
      limit 1`,
    [cid],
  )
  const row = r.rows[0]
  if (!row) throw Object.assign(new Error('conversation_not_found'), { statusCode: 404 })
  if (row.closed_at) throw Object.assign(new Error('closed'), { statusCode: 403 })

  if (row.kind === 'channel') {
    const replyTo = typeof msg?.replyToMessageId === 'string' ? msg.replyToMessageId.trim() : ''
    const isComment = !!replyTo && replyTo !== 'null'

    if (isComment) {
      const cm = (row.channel_comments_mode ?? '').trim()
      if (cm && cm !== 'any') throw Object.assign(new Error('channel_comments_forbidden'), { statusCode: 403 })
      return
    }

    const pm = (row.channel_posting_mode ?? '').trim()
    if (!pm || pm === 'any') return

    // admins_only / mods_only etc: check role in members
    const m = await pool.query<{ role: string }>(
      `select role from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`,
      [cid, userId],
    )
    const role = (m.rows[0]?.role ?? 'member').trim()
    const isAdmin = role === 'owner' || role === 'admin' || role === 'moderator'
    if (!isAdmin) throw Object.assign(new Error('channel_posting_forbidden'), { statusCode: 403 })
  }
}

export function createWsHub(args: { pool: Pool; logger: { info: (...a: any[]) => void } }): WsHub {
  const { pool, logger } = args

  const clients = new Set<WsClient>()
  const wss = new WebSocketServer({ noServer: true })

  function broadcastDbChange(channel: string, table: string, action: DbChangeAction, row: unknown): void {
    const msg = JSON.stringify({ type: 'db_change', channel, table, action, row })
    for (const c of clients) {
      if (!c.channels.has(channel)) continue
      try {
        c.ws.send(msg)
      } catch {
        /* noop */
      }
    }
  }

  function broadcastTyped(channel: string, event: string, payload: unknown): void {
    const msg = JSON.stringify({ type: 'broadcast', channel, event, payload })
    for (const c of clients) {
      if (!c.channels.has(channel)) continue
      try {
        c.ws.send(msg)
      } catch {
        /* noop */
      }
    }
  }

  function threadChannel(conversationId: string): string {
    return `thread:${conversationId}`
  }

  function userFeedChannel(userId: string): string {
    return `messenger-user:${userId}`
  }

  function previewForMessage(row: Record<string, unknown>): string {
    const kind = typeof row.kind === 'string' ? row.kind.trim() : ''
    if (kind === 'image') return 'Изображение'
    if (kind === 'audio') return 'Голосовое'
    const body = typeof row.body === 'string' ? row.body.trim() : ''
    return body.length > 280 ? body.slice(0, 280) : body
  }

  function mapMessageForClient(row: Record<string, unknown>): any {
    return {
      id: String(row.id ?? ''),
      conversationId: typeof row.conversation_id === 'string' ? row.conversation_id : '',
      senderUserId: typeof row.sender_user_id === 'string' ? row.sender_user_id : null,
      kind: typeof row.kind === 'string' ? row.kind : 'text',
      body: typeof row.body === 'string' ? row.body : '',
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      editedAt: typeof row.edited_at === 'string' ? row.edited_at : null,
      replyToMessageId: typeof row.reply_to_message_id === 'string' ? row.reply_to_message_id : null,
      quoteToMessageId: typeof row.quote_to_message_id === 'string' ? row.quote_to_message_id : null,
      meta: row.meta ?? null,
    }
  }

  wss.on('connection', (ws: any, req: any, client: WsClient) => {
    ws.on('message', (raw: any) => {
      let msg: any
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      const type = String(msg?.type ?? '')
      if (type === 'subscribe') {
        const ch = String(msg?.channel ?? '').trim()
        if (ch) client.channels.add(ch)
        return
      }
      if (type === 'unsubscribe') {
        const ch = String(msg?.channel ?? '').trim()
        if (ch) client.channels.delete(ch)
        return
      }
      if (type === 'broadcast') {
        const ch = String(msg?.channel ?? '').trim()
        const ev = String(msg?.event ?? '').trim()
        if (!ch || !ev) return
        // IMPORTANT: production must restrict who can broadcast where.
        const out = JSON.stringify({ type: 'broadcast', channel: ch, event: ev, payload: msg?.payload })
        for (const c of clients) {
          if (!c.channels.has(ch)) continue
          try {
            c.ws.send(out)
          } catch {
            /* noop */
          }
        }
        return
      }

      if (type === 'send_message') {
        const clientId = String(msg?.clientId ?? '').trim()
        const conversationId = String(msg?.conversationId ?? '').trim()
        const body = typeof msg?.body === 'string' ? msg.body : ''
        const kind = typeof msg?.kind === 'string' ? String(msg.kind) : 'text'
        const meta = msg?.meta ?? null
        const replyToMessageId = typeof msg?.replyToMessageId === 'string' ? msg.replyToMessageId : null
        const quoteToMessageId = typeof msg?.quoteToMessageId === 'string' ? msg.quoteToMessageId : null

        if (!clientId || clientId.length > 80) return
        const cached = getCachedAck(client.userId, clientId)
        if (cached) {
          try {
            ws.send(JSON.stringify(cached))
          } catch {
            /* noop */
          }
          return
        }

        if (!conversationId) {
          const ack = { type: 'ack', clientId, ok: false, error: { message: 'conversation_required' } }
          cacheAck(client.userId, clientId, ack)
          try {
            ws.send(JSON.stringify(ack))
          } catch {
            /* noop */
          }
          return
        }
        if (!body || body.length > 20_000) {
          const ack = { type: 'ack', clientId, ok: false, error: { message: 'body_invalid' } }
          cacheAck(client.userId, clientId, ack)
          try {
            ws.send(JSON.stringify(ack))
          } catch {
            /* noop */
          }
          return
        }

        void (async () => {
          try {
            await assertCanPostToConversation(pool, conversationId, client.userId, msg)
            const data = await appendDirectMessage(pool, {
              userId: client.userId,
              conversationId,
              body,
              kind: kind as any,
              meta,
              replyToMessageId,
              quoteToMessageId,
            })
            const messageId = typeof (data as any)?.message_id === 'string' ? (data as any).message_id : (data as any)?.id
            const ack = { type: 'ack', clientId, ok: true, data: { messageId: messageId ?? null } }
            cacheAck(client.userId, clientId, ack)
            try {
              ws.send(JSON.stringify(ack))
            } catch {
              /* noop */
            }
          } catch (e: any) {
            const ack = { type: 'ack', clientId, ok: false, error: { message: e?.message ?? 'send_failed' } }
            cacheAck(client.userId, clientId, ack)
            try {
              ws.send(JSON.stringify(ack))
            } catch {
              /* noop */
            }
          }
        })()
        return
      }

      if (type === 'mark_read') {
        const clientId = String(msg?.clientId ?? '').trim()
        const conversationId = String(msg?.conversationId ?? '').trim()
        if (!clientId || clientId.length > 80) return
        void (async () => {
          try {
            await markDirectConversationRead(pool, client.userId, conversationId)
            ws.send(JSON.stringify({ type: 'ack', clientId, ok: true }))
          } catch (e: any) {
            ws.send(JSON.stringify({ type: 'ack', clientId, ok: false, error: { message: e?.message ?? 'mark_read_failed' } }))
          }
        })()
        return
      }

      if (type === 'toggle_reaction') {
        const clientId = String(msg?.clientId ?? '').trim()
        const conversationId = String(msg?.conversationId ?? '').trim()
        const targetMessageId = String(msg?.targetMessageId ?? '').trim()
        const emoji = String(msg?.emoji ?? '').trim()
        if (!clientId || clientId.length > 80) return
        void (async () => {
          try {
            const data = await toggleDirectMessageReaction(pool, { userId: client.userId, conversationId, targetMessageId, emoji })
            ws.send(JSON.stringify({ type: 'ack', clientId, ok: true, data }))
          } catch (e: any) {
            ws.send(JSON.stringify({ type: 'ack', clientId, ok: false, error: { message: e?.message ?? 'toggle_reaction_failed' } }))
          }
        })()
      }
    })
  })

  function handleUpgrade(req: any, socket: any, head: any, userId: string): void {
    const client: WsClient = { userId, ws: null as any, channels: new Set() }
    wss.handleUpgrade(req, socket, head, (ws) => {
      client.ws = ws as any
      clients.add(client)
      ws.on('close', () => clients.delete(client))
      wss.emit('connection', ws, req, client)
    })
  }

  logger.info({ ws: true }, 'ws_hub_ready')

  return {
    wss,
    clients,
    broadcastDbChange,
    broadcastTyped,
    threadChannel,
    userFeedChannel,
    mapMessageForClient,
    previewForMessage,
    handleUpgrade,
  }
}

