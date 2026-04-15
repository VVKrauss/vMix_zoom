import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { supabase } from './supabase'
import { mapDirectMessageFromRow, type DirectMessage } from './messenger'

export type ChannelSummary = {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
  unreadCount: number
  isPublic: boolean
  postingMode: 'admins_only' | 'everyone'
  commentsMode: 'everyone' | 'disabled'
}

function mapChannelRow(row: Record<string, unknown>): ChannelSummary {
  const id = String(row.id ?? '')
  const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : 'Канал'
  return {
    id,
    title,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    lastMessagePreview: typeof row.last_message_preview === 'string' ? row.last_message_preview : null,
    messageCount: typeof row.message_count === 'number' ? row.message_count : Number(row.message_count ?? 0) || 0,
    unreadCount: typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0,
    isPublic: row.is_public === true,
    postingMode: row.posting_mode === 'everyone' ? 'everyone' : 'admins_only',
    commentsMode: row.comments_mode === 'disabled' ? 'disabled' : 'everyone',
  }
}

export async function listMyChannels(): Promise<{ data: ChannelSummary[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_channels')
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? data : []
  return { data: rows.map((r) => mapChannelRow(r as Record<string, unknown>)).filter((x) => x.id), error: null }
}

export async function markChannelRead(conversationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_channel_read', { p_conversation_id: conversationId.trim() })
  return { error: error?.message ?? null }
}

export async function createChannel(
  title: string,
  opts?: { isPublic?: boolean; postingMode?: 'admins_only' | 'everyone'; commentsMode?: 'everyone' | 'disabled' },
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_channel', {
    p_title: title,
    p_is_public: opts?.isPublic ?? false,
    p_posting_mode: opts?.postingMode ?? 'admins_only',
    p_comments_mode: opts?.commentsMode ?? 'everyone',
  })
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function joinPublicChannel(conversationId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('join_public_channel', { p_conversation_id: conversationId.trim() })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { error: typeof row?.error === 'string' ? row.error : 'not_joined' }
  return { error: null }
}

function mapMessagesFromRows(rows: unknown): DirectMessage[] {
  const arr = Array.isArray(rows) ? rows : []
  return arr.map((r) => mapDirectMessageFromRow(r as Record<string, unknown>)).filter((m) => m.id)
}

export async function listChannelPostsPage(
  conversationId: string,
  options?: { limit?: number; before?: { createdAt: string; id: string } },
): Promise<{ data: DirectMessage[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 30, 80))
  const before = options?.before
  const { data, error } = await supabase.rpc('list_channel_posts_page', {
    p_conversation_id: conversationId.trim(),
    p_limit: limit,
    p_before_created_at: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
  })
  if (error) return { data: null, error: error.message, hasMoreOlder: false }
  const newestFirst = mapMessagesFromRows(data)
  const chronological = [...newestFirst].reverse()
  return { data: chronological, error: null, hasMoreOlder: newestFirst.length === limit }
}

export async function listChannelCommentsPage(
  conversationId: string,
  postId: string,
  options?: { limit?: number; before?: { createdAt: string; id: string } },
): Promise<{ data: DirectMessage[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 120))
  const before = options?.before
  const { data, error } = await supabase.rpc('list_channel_comments_page', {
    p_conversation_id: conversationId.trim(),
    p_post_id: postId.trim(),
    p_limit: limit,
    p_before_created_at: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
  })
  if (error) return { data: null, error: error.message, hasMoreOlder: false }
  const newestFirst = mapMessagesFromRows(data)
  const chronological = [...newestFirst].reverse()
  return { data: chronological, error: null, hasMoreOlder: newestFirst.length === limit }
}

function parseOkMessageResult(data: unknown): { messageId: string | null; createdAt: string | null } {
  if (!data || typeof data !== 'object') return { messageId: null, createdAt: null }
  const r = data as Record<string, unknown>
  return {
    messageId: typeof r.message_id === 'string' ? r.message_id : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

export async function appendChannelPost(
  conversationId: string,
  body: string,
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('append_channel_post', {
    p_conversation_id: conversationId.trim(),
    p_body: body,
  })
  if (error) return { data: null, error: error.message }
  return { data: parseOkMessageResult(data), error: null }
}

export async function appendChannelComment(
  conversationId: string,
  postId: string,
  body: string,
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('append_channel_comment', {
    p_conversation_id: conversationId.trim(),
    p_reply_to_message_id: postId.trim(),
    p_body: body,
  })
  if (error) return { data: null, error: error.message }
  return { data: parseOkMessageResult(data), error: null }
}

export type ToggleChannelReactionResult = { action: 'added' | 'removed'; messageId: string; createdAt: string | null }

function parseToggleReaction(data: unknown): ToggleChannelReactionResult | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const action = r.action === 'removed' ? 'removed' : r.action === 'added' ? 'added' : null
  const messageId = typeof r.message_id === 'string' && r.message_id.trim() ? r.message_id.trim() : null
  if (!action || !messageId) return null
  return { action, messageId, createdAt: typeof r.created_at === 'string' ? r.created_at : null }
}

export function isAllowedReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI_WHITELIST as readonly string[]).includes(value)
}

export async function toggleChannelMessageReaction(
  conversationId: string,
  targetMessageId: string,
  emoji: ReactionEmoji,
): Promise<{ data: ToggleChannelReactionResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_channel_message_reaction', {
    p_conversation_id: conversationId.trim(),
    p_target_message_id: targetMessageId.trim(),
    p_emoji: emoji,
  })
  if (error) return { data: null, error: error.message }
  return { data: parseToggleReaction(data), error: null }
}

