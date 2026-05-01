import { supabase } from './supabase'

export type BookmarkScope = 'me' | 'all'

export type MessageBookmarkRow = {
  bookmarkId: string
  bookmarkCreatedAt: string
  messageId: string
  messageKind: string
  messageBody: string
  messageCreatedAt: string
  senderUserId: string | null
  senderNameSnapshot: string
  editedAt: string | null
  replyToMessageId: string | null
  quoteToMessageId: string | null
  meta: unknown
}

function mapBookmarkRow(raw: Record<string, unknown>): MessageBookmarkRow | null {
  const bookmarkId = typeof raw.bookmark_id === 'string' ? raw.bookmark_id.trim() : ''
  const messageId = typeof raw.message_id === 'string' ? raw.message_id.trim() : ''
  if (!bookmarkId || !messageId) return null
  return {
    bookmarkId,
    bookmarkCreatedAt: typeof raw.bookmark_created_at === 'string' ? raw.bookmark_created_at : new Date(0).toISOString(),
    messageId,
    messageKind: typeof raw.message_kind === 'string' ? raw.message_kind : 'text',
    messageBody: typeof raw.message_body === 'string' ? raw.message_body : '',
    messageCreatedAt: typeof raw.message_created_at === 'string' ? raw.message_created_at : new Date(0).toISOString(),
    senderUserId: typeof raw.sender_user_id === 'string' ? raw.sender_user_id : null,
    senderNameSnapshot: typeof raw.sender_name_snapshot === 'string' ? raw.sender_name_snapshot : 'Пользователь',
    editedAt: typeof raw.edited_at === 'string' ? raw.edited_at : null,
    replyToMessageId: typeof raw.reply_to_message_id === 'string' ? raw.reply_to_message_id : null,
    quoteToMessageId: typeof raw.quote_to_message_id === 'string' ? raw.quote_to_message_id : null,
    meta: raw.meta ?? null,
  }
}

export async function bookmarkMessage(messageId: string, scope: BookmarkScope): Promise<{ ok: true } | { ok: false; error: string }> {
  const mid = messageId.trim()
  if (!mid) return { ok: false, error: 'message_required' }
  const { data, error } = await supabase.rpc('bookmark_message', { p_message_id: mid, p_scope: scope })
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown> | null
  if (row?.ok === true) return { ok: true }
  const code = typeof row?.error === 'string' ? row.error.trim() : ''
  return { ok: false, error: code || 'unknown_error' }
}

export async function unbookmarkMessage(messageId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const mid = messageId.trim()
  if (!mid) return { ok: false, error: 'message_required' }
  const { data, error } = await supabase.rpc('unbookmark_message', { p_message_id: mid })
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown> | null
  if (row?.ok === true) return { ok: true }
  const code = typeof row?.error === 'string' ? row.error.trim() : ''
  return { ok: false, error: code || 'unknown_error' }
}

export async function countMessageBookmarks(conversationId: string): Promise<{ data: number | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const { data, error } = await supabase.rpc('count_message_bookmarks', { p_conversation_id: cid })
  if (error) return { data: null, error: error.message }
  const n = typeof data === 'number' && Number.isFinite(data) ? data : Number(data ?? 0)
  return { data: Number.isFinite(n) ? n : 0, error: null }
}

export async function listMessageBookmarks(args: {
  conversationId: string
  limit?: number
  before?: string | null
}): Promise<{ data: MessageBookmarkRow[] | null; error: string | null }> {
  const cid = args.conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const { data, error } = await supabase.rpc('list_message_bookmarks', {
    p_conversation_id: cid,
    p_limit: args.limit ?? 60,
    p_before: args.before ?? null,
  })
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []
  const mapped = rows.map(mapBookmarkRow).filter((x): x is MessageBookmarkRow => x != null)
  return { data: mapped, error: null }
}

