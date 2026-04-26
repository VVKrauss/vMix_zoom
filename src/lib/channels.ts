import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { mapDirectMessageFromRow, type DirectMessage } from './messenger'
import { v1ListMyChannels, v1MarkConversationRead } from '../api/messengerApi'
import {
  v1AppendChannelComment,
  v1AppendChannelFeedMessage,
  v1AppendChannelPostRich,
  v1CreateChannel,
  v1DeleteChannelComment,
  v1DeleteChannelPost,
  v1EditChannelComment,
  v1EditChannelPostRich,
  v1JoinPublicChannel,
  v1LeaveChannel,
  v1ListChannelCommentCounts,
  v1ListChannelCommentsPage,
  v1ListChannelPostsPage,
  v1ListChannelReactionsForTargets,
  v1ToggleChannelReaction,
  v1UpdateChannelProfile,
} from '../api/channelApi'

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
  publicNick: string | null
  avatarPath: string | null
  avatarThumbPath: string | null
  memberCount: number
  requiredSubscriptionPlan?: string | null
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
    publicNick: typeof row.public_nick === 'string' && row.public_nick.trim() ? row.public_nick.trim() : null,
    avatarPath: typeof row.avatar_path === 'string' && row.avatar_path.trim() ? row.avatar_path.trim() : null,
    avatarThumbPath:
      typeof row.avatar_thumb_path === 'string' && row.avatar_thumb_path.trim() ? row.avatar_thumb_path.trim() : null,
    memberCount: typeof row.member_count === 'number' ? row.member_count : Number(row.member_count ?? 0) || 0,
    requiredSubscriptionPlan:
      typeof row.required_subscription_plan === 'string' && row.required_subscription_plan.trim()
        ? row.required_subscription_plan.trim()
        : null,
  }
}

export async function listMyChannels(): Promise<{ data: ChannelSummary[] | null; error: string | null }> {
  const { data, error } = await v1ListMyChannels()
  if (error || !data) return { data: null, error }
  const rows = Array.isArray(data) ? data : []
  return { data: rows.map((r) => mapChannelRow(r as Record<string, unknown>)).filter((x) => x.id), error: null }
}

export async function markChannelRead(conversationId: string): Promise<{ error: string | null }> {
  const r = await v1MarkConversationRead(conversationId)
  return { error: r.error }
}

export async function createChannel(
  title: string,
  opts?: { isPublic?: boolean; postingMode?: 'admins_only' | 'everyone'; commentsMode?: 'everyone' | 'disabled' },
): Promise<{ data: string | null; error: string | null }> {
  return await v1CreateChannel({
    title,
    isPublic: opts?.isPublic ?? false,
    postingMode: opts?.postingMode ?? 'admins_only',
    commentsMode: opts?.commentsMode ?? 'everyone',
  })
}

export async function updateChannelProfile(args: {
  conversationId: string
  title?: string | null
  publicNick?: string | null
  isPublic?: boolean | null
  postingMode?: 'admins_only' | 'everyone' | null
  commentsMode?: 'everyone' | 'disabled' | null
  avatarPath?: string | null
  avatarThumbPath?: string | null
}): Promise<{ error: string | null }> {
  return await v1UpdateChannelProfile(args.conversationId, {
    title: args.title ?? undefined,
    publicNick: args.publicNick ?? undefined,
    isPublic: args.isPublic ?? undefined,
    postingMode: args.postingMode ?? undefined,
    commentsMode: args.commentsMode ?? undefined,
    avatarPath: args.avatarPath ?? undefined,
    avatarThumbPath: args.avatarThumbPath ?? undefined,
  })
}

export async function joinPublicChannel(conversationId: string): Promise<{ error: string | null }> {
  return await v1JoinPublicChannel(conversationId)
}

export async function leaveChannel(conversationId: string): Promise<{ error: string | null }> {
  return await v1LeaveChannel(conversationId)
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
  const r = await v1ListChannelPostsPage({ conversationId, limit, before: before ?? null })
  if (r.error) return { data: null, error: r.error, hasMoreOlder: false }
  // v1 already returns chronological (oldest -> newest).
  const chronological = mapMessagesFromRows(r.data)
  return { data: chronological, error: null, hasMoreOlder: chronological.length === limit }
}

export async function listChannelCommentsPage(
  conversationId: string,
  postId: string,
  options?: { limit?: number; before?: { createdAt: string; id: string } },
): Promise<{ data: DirectMessage[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 120))
  const before = options?.before
  const r = await v1ListChannelCommentsPage({ conversationId, postId, limit, before: before ?? null })
  if (r.error) return { data: null, error: r.error, hasMoreOlder: false }
  // v1 already returns chronological (oldest -> newest).
  const chronological = mapMessagesFromRows(r.data)
  return { data: chronological, error: null, hasMoreOlder: chronological.length === limit }
}

/** Реакции (kind=reaction) на посты и комментарии — отдельная выборка по meta.react_to. */
export async function listChannelReactionsForTargets(
  conversationId: string,
  targetIds: string[],
): Promise<{ data: DirectMessage[] | null; error: string | null }> {
  const cid = conversationId.trim()
  const ids = [...new Set(targetIds.map((x) => x.trim()).filter(Boolean))]
  if (!cid || ids.length === 0) return { data: [], error: null }
  const r = await v1ListChannelReactionsForTargets({ conversationId: cid, targetIds: ids })
  if (r.error) return { data: null, error: r.error }
  return { data: mapMessagesFromRows(r.data), error: null }
}

export async function listChannelCommentCounts(
  conversationId: string,
  postIds: string[],
): Promise<{ data: Record<string, number> | null; error: string | null }> {
  const cid = conversationId.trim()
  const ids = postIds.map((x) => x.trim()).filter(Boolean)
  if (!cid || ids.length === 0) return { data: {}, error: null }
  const r = await v1ListChannelCommentCounts({ conversationId: cid, postIds: ids })
  if (r.error) return { data: null, error: r.error }
  const out: Record<string, number> = {}
  const rows = Array.isArray(r.data) ? r.data : []
  for (const r of rows) {
    const row = r as Record<string, unknown>
    const pid = typeof row.post_id === 'string' ? row.post_id : String(row.post_id ?? '')
    if (!pid) continue
    const n = typeof row.comment_count === 'number' ? row.comment_count : Number(row.comment_count ?? 0) || 0
    out[pid] = n
  }
  return { data: out, error: null }
}

function parseOkMessageResult(data: unknown): { messageId: string | null; createdAt: string | null } {
  if (!data || typeof data !== 'object') return { messageId: null, createdAt: null }
  const r = data as Record<string, unknown>
  return {
    messageId: typeof r.message_id === 'string' ? r.message_id : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

export async function appendChannelPostRich(
  conversationId: string,
  body: string,
  meta?: Record<string, unknown> | null,
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const r = await v1AppendChannelPostRich({ conversationId, body, meta: meta ?? null })
  if (r.error) return { data: null, error: r.error }
  return { data: parseOkMessageResult(r.data), error: null }
}

/** Лента канала: как сообщение в группе (текст + meta, фото). */
export async function appendChannelFeedMessage(
  conversationId: string,
  args: { kind?: 'text' | 'image' | 'audio'; body: string; meta?: Record<string, unknown> | null },
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const r = await v1AppendChannelFeedMessage({ conversationId, kind: args.kind, body: args.body, meta: args.meta ?? null })
  if (r.error) return { data: null, error: r.error }
  return { data: parseOkMessageResult(r.data), error: null }
}

export async function appendChannelComment(
  conversationId: string,
  postId: string,
  body: string,
  options?: { quoteToMessageId?: string | null },
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const r = await v1AppendChannelComment({
    conversationId,
    postId,
    body,
    quoteToMessageId: options?.quoteToMessageId?.trim() || null,
  })
  if (r.error) return { data: null, error: r.error }
  return { data: parseOkMessageResult(r.data), error: null }
}

export async function editChannelComment(
  conversationId: string,
  messageId: string,
  newBody: string,
): Promise<{ error: string | null }> {
  return await v1EditChannelComment({ conversationId, messageId, newBody })
}

export async function deleteChannelComment(
  conversationId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  return await v1DeleteChannelComment({ conversationId, messageId })
}

export async function editChannelPostRich(
  conversationId: string,
  messageId: string,
  newBody: string,
  meta: Record<string, unknown> | null,
): Promise<{ error: string | null }> {
  return await v1EditChannelPostRich({ conversationId, messageId, newBody, meta })
}

export async function deleteChannelPost(
  conversationId: string,
  messageId: string,
): Promise<{ error: string | null; deleted: number }> {
  const r = await v1DeleteChannelPost({ conversationId, messageId })
  if (r.error) return { error: r.error, deleted: 0 }
  return { error: null, deleted: r.data?.deleted ?? 0 }
}

export type ToggleChannelReactionResult = { action: 'added' | 'removed'; messageId: string; createdAt: string | null }

function parseToggleReaction(data: unknown): ToggleChannelReactionResult | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const action = r.action === 'removed' ? 'removed' : r.action === 'added' ? 'added' : null
  const rawId = r.message_id
  const messageId =
    typeof rawId === 'string' && rawId.trim()
      ? rawId.trim()
      : rawId != null && String(rawId).trim()
        ? String(rawId).trim()
        : null
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
  const r = await v1ToggleChannelReaction({ conversationId, targetMessageId, emoji })
  if (r.error) return { data: null, error: r.error }
  return { data: parseToggleReaction(r.data), error: null }
}

