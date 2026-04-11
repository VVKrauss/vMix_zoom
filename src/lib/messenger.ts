import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { supabase } from './supabase'

/** Событие для мгновенного пересчёта бейджа непрочитанных (см. useMessengerUnreadCount). */
export const MESSENGER_UNREAD_REFRESH_EVENT = 'vmix:messenger-unread-refresh'

export function requestMessengerUnreadRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MESSENGER_UNREAD_REFRESH_EVENT))
}

export type DirectConversationSummary = {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
  unreadCount: number
  otherUserId: string | null
  avatarUrl: string | null
}

export type DirectMessage = {
  id: string
  senderUserId: string | null
  senderNameSnapshot: string
  kind: 'text' | 'system' | 'reaction'
  body: string
  createdAt: string
  /** Для kind=reaction: id целевого сообщения (сервер: meta.react_to). */
  meta?: { react_to?: string } | null
}

function mapMetaFromRow(raw: unknown): DirectMessage['meta'] {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const reactTo = o.react_to
  if (typeof reactTo === 'string' && reactTo.trim()) return { react_to: reactTo.trim() }
  return null
}

/** Строка из PostgREST / Realtime (snake_case). */
export function mapDirectMessageFromRow(row: Record<string, unknown>): DirectMessage {
  return {
    id: String(row.id),
    senderUserId: typeof row.sender_user_id === 'string' ? row.sender_user_id : null,
    senderNameSnapshot:
      typeof row.sender_name_snapshot === 'string' && row.sender_name_snapshot.trim()
        ? row.sender_name_snapshot.trim()
        : 'Вы',
    kind: row.kind === 'reaction' || row.kind === 'system' ? row.kind : 'text',
    body: typeof row.body === 'string' ? row.body : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    meta: mapMetaFromRow(row.meta),
  }
}

function mapDirectConversationRow(row: Record<string, unknown>): DirectConversationSummary {
  const storedTitle = typeof row.title === 'string' ? row.title.trim() : ''
  const otherUserId = typeof row.other_user_id === 'string' ? row.other_user_id : null
  const otherDisplayName =
    typeof row.other_display_name === 'string' && row.other_display_name.trim()
      ? row.other_display_name.trim()
      : ''
  const otherAvatarFromRpc =
    typeof row.other_avatar_url === 'string' && row.other_avatar_url.trim()
      ? row.other_avatar_url.trim()
      : null

  const displayTitle = otherUserId
    ? otherDisplayName || storedTitle || 'Личный чат'
    : storedTitle || 'Сохраненное'

  return {
    id: String(row.id),
    title: displayTitle,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    lastMessagePreview: typeof row.last_message_preview === 'string' ? row.last_message_preview : null,
    messageCount: typeof row.message_count === 'number' ? row.message_count : Number(row.message_count ?? 0) || 0,
    unreadCount: typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0,
    otherUserId,
    avatarUrl: otherUserId ? otherAvatarFromRpc : null,
  }
}

async function attachConversationAvatars(
  items: DirectConversationSummary[],
): Promise<DirectConversationSummary[]> {
  const userIds = Array.from(
    new Set(
      items
        .map((item) => item.otherUserId?.trim() ?? '')
        .filter(Boolean),
    ),
  )

  if (userIds.length === 0) return items

  const { data, error } = await supabase
    .from('users')
    .select('id, avatar_url')
    .in('id', userIds)

  if (error) return items

  const avatarMap = new Map<string, string | null>()
  for (const row of data ?? []) {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id) continue
    avatarMap.set(id, typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null)
  }

  return items.map((item) => ({
    ...item,
    avatarUrl: item.otherUserId
      ? item.avatarUrl ?? avatarMap.get(item.otherUserId) ?? null
      : null,
  }))
}

export async function ensureSelfDirectConversation(): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_self_direct_conversation')
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function listDirectConversationsForUser(
): Promise<{ data: DirectConversationSummary[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_direct_conversations')
  if (error) return { data: null, error: error.message }
  const mapped = (data ?? []).map((row: unknown) => mapDirectConversationRow(row as Record<string, unknown>))
  const withAvatars = await attachConversationAvatars(mapped)
  return {
    data: withAvatars,
    error: null,
  }
}

export async function getDirectConversationForUser(
  conversationId: string,
): Promise<{ data: DirectConversationSummary | null; error: string | null }> {
  const list = await listDirectConversationsForUser()
  if (list.error) return { data: null, error: list.error }
  const item = (list.data ?? []).find((row) => row.id === conversationId) ?? null
  return { data: item, error: null }
}

const DIRECT_MESSAGES_PAGE_MAX = 100

/** Для PostgREST or(): значение created_at в двойных кавычках. */
function escapePostgrestQuotedTimestamp(iso: string): string {
  return iso.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Страница личных сообщений: по умолчанию последние `limit` штук;
 * с `before` — ещё `limit` сообщений старше курсора (created_at, id).
 *
 * Реализовано через PostgREST (RLS на `chat_messages`), без RPC — чтобы работало,
 * даже если миграция `list_direct_messages_page` ещё не применена на проекте.
 */
export async function listDirectMessagesPage(
  conversationId: string,
  options?: { before?: { createdAt: string; id: string }; limit?: number },
): Promise<{ data: DirectMessage[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.min(
    Math.max(options?.limit ?? 50, 1),
    DIRECT_MESSAGES_PAGE_MAX,
  )
  const before = options?.before

  const convo = await getDirectConversationForUser(conversationId)
  if (convo.error) return { data: null, error: convo.error, hasMoreOlder: false }
  if (!convo.data) return { data: null, error: 'Чат не найден', hasMoreOlder: false }

  let query = supabase
    .from('chat_messages')
    .select('id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (before) {
    const ts = escapePostgrestQuotedTimestamp(before.createdAt)
    const bid = before.id.trim()
    query = query.or(`and(created_at.eq."${ts}",id.lt.${bid}),created_at.lt."${ts}"`)
  }

  const { data, error } = await query

  if (error) return { data: null, error: error.message, hasMoreOlder: false }

  const rows = (data ?? []) as Record<string, unknown>[]
  const chronological = [...rows].reverse().map((row) => mapDirectMessageFromRow(row))
  const hasMoreOlder = rows.length === limit
  return { data: chronological, error: null, hasMoreOlder }
}

export async function ensureDirectConversationWithUser(
  targetUserId: string,
  targetTitle?: string | null,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_direct_conversation_with_user', {
    p_target_user_id: targetUserId,
    p_target_title: targetTitle ?? null,
  })
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function markDirectConversationRead(
  conversationId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_direct_conversation_read', {
    p_conversation_id: conversationId,
  })
  if (!error) requestMessengerUnreadRefresh()
  return { error: error?.message ?? null }
}

export async function getDirectUnreadCount(): Promise<{ data: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_direct_conversations')
  if (error) return { data: null, error: error.message }
  const count = Array.isArray(data)
    ? data.reduce((sum: number, row: Record<string, unknown>) => sum + (typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0), 0)
    : 0
  return { data: count, error: null }
}

export type AppendDirectMessageResult = {
  messageId: string | null
  createdAt: string | null
}

function parseAppendDirectMessageRpcPayload(data: unknown): AppendDirectMessageResult {
  if (!data || typeof data !== 'object') return { messageId: null, createdAt: null }
  const r = data as Record<string, unknown>
  return {
    messageId: typeof r.message_id === 'string' && r.message_id ? r.message_id : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

export async function appendDirectMessage(
  conversationId: string,
  body: string,
  options?: { kind?: 'text' | 'system' | 'reaction'; meta?: Record<string, unknown> | null },
): Promise<{ data: AppendDirectMessageResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('append_direct_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_kind: options?.kind ?? 'text',
    p_meta: options?.meta ?? null,
  })

  if (error) return { data: null, error: error.message }
  return {
    data: parseAppendDirectMessageRpcPayload(data),
    error: null,
  }
}

export type ToggleDirectMessageReactionResult = {
  action: 'added' | 'removed'
  messageId: string
  createdAt: string | null
}

function parseToggleDirectMessageReactionPayload(data: unknown): ToggleDirectMessageReactionResult | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const action = r.action === 'removed' ? 'removed' : r.action === 'added' ? 'added' : null
  const messageId =
    typeof r.message_id === 'string' && r.message_id.trim() ? r.message_id.trim() : null
  if (!action || !messageId) return null
  return {
    action,
    messageId,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

export function isDirectReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI_WHITELIST as readonly string[]).includes(value)
}

export async function toggleDirectMessageReaction(
  conversationId: string,
  targetMessageId: string,
  emoji: ReactionEmoji,
): Promise<{ data: ToggleDirectMessageReactionResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_direct_message_reaction', {
    p_conversation_id: conversationId,
    p_target_message_id: targetMessageId,
    p_emoji: emoji,
  })
  if (error) return { data: null, error: error.message }
  return { data: parseToggleDirectMessageReactionPayload(data), error: null }
}
