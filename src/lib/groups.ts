import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { supabase } from './supabase'
import { mapDirectMessageFromRow, type DirectMessage } from './messenger'

export type GroupChatSummary = {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
  unreadCount: number
  isPublic: boolean
}

function mapGroupRow(row: Record<string, unknown>): GroupChatSummary {
  const id = String(row.id ?? '')
  const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : 'Группа'
  return {
    id,
    title,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    lastMessagePreview: typeof row.last_message_preview === 'string' ? row.last_message_preview : null,
    messageCount: typeof row.message_count === 'number' ? row.message_count : Number(row.message_count ?? 0) || 0,
    unreadCount: typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0,
    isPublic: row.is_public === true,
  }
}

export async function createGroupChat(
  title: string,
  isPublic: boolean,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_group_chat', { p_title: title, p_is_public: isPublic })
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function joinPublicGroupChat(conversationId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('join_public_group_chat', { p_conversation_id: conversationId.trim() })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { error: typeof row?.error === 'string' ? row.error : 'not_joined' }
  return { error: null }
}

export async function addUsersToGroupChat(conversationId: string, userIds: string[]): Promise<{ error: string | null; added: number }> {
  const { data, error } = await supabase.rpc('add_users_to_group_chat', {
    p_conversation_id: conversationId.trim(),
    p_user_ids: userIds,
  })
  if (error) return { error: error.message, added: 0 }
  const row = data as Record<string, unknown> | null
  const added = typeof row?.added === 'number' ? row!.added : Number(row?.added ?? 0) || 0
  return { error: row && row.ok === false ? (typeof row.error === 'string' ? row.error : 'forbidden') : null, added }
}

export async function listMyGroupChats(): Promise<{ data: GroupChatSummary[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_group_chats')
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? data : []
  return { data: rows.map((r) => mapGroupRow(r as Record<string, unknown>)).filter((x) => x.id), error: null }
}

export async function markGroupRead(conversationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_group_read', { p_conversation_id: conversationId.trim() })
  return { error: error?.message ?? null }
}

function mapMessagesFromRows(rows: unknown): DirectMessage[] {
  const arr = Array.isArray(rows) ? rows : []
  return arr.map((r) => mapDirectMessageFromRow(r as Record<string, unknown>)).filter((m) => m.id)
}

export async function listGroupMessagesPage(
  conversationId: string,
  options?: { limit?: number; before?: { createdAt: string; id: string } },
): Promise<{ data: DirectMessage[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 120))
  const before = options?.before
  const { data, error } = await supabase.rpc('list_group_messages_page', {
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

function parseOkMessageResult(data: unknown): { messageId: string | null; createdAt: string | null } {
  if (!data || typeof data !== 'object') return { messageId: null, createdAt: null }
  const r = data as Record<string, unknown>
  return {
    messageId: typeof r.message_id === 'string' ? r.message_id : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

export async function appendGroupMessage(
  conversationId: string,
  args: { kind?: 'text' | 'image' | 'system'; body: string; meta?: Record<string, unknown> | null; replyToMessageId?: string | null },
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('append_group_message', {
    p_conversation_id: conversationId.trim(),
    p_body: args.body,
    p_kind: args.kind ?? 'text',
    p_meta: args.meta ?? null,
    p_reply_to_message_id: args.replyToMessageId ?? null,
  })
  if (error) return { data: null, error: error.message }
  return { data: parseOkMessageResult(data), error: null }
}

export type ToggleGroupReactionResult = { action: 'added' | 'removed'; messageId: string; createdAt: string | null }

function parseToggleReaction(data: unknown): ToggleGroupReactionResult | null {
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

export async function toggleGroupMessageReaction(
  conversationId: string,
  targetMessageId: string,
  emoji: ReactionEmoji,
): Promise<{ data: ToggleGroupReactionResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_group_message_reaction', {
    p_conversation_id: conversationId.trim(),
    p_target_message_id: targetMessageId.trim(),
    p_emoji: emoji,
  })
  if (error) return { data: null, error: error.message }
  return { data: parseToggleReaction(data), error: null }
}

