import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { mapDirectMessageFromRow, type DirectMessage } from './messenger'
import {
  v1AppendConversationMessage,
  v1DeleteConversationMessage,
  v1ListConversationMessagesPage,
  v1ListMyGroups,
  v1MarkConversationRead,
  v1ToggleConversationReaction,
} from '../api/messengerApi'
import {
  v1AddUsersToGroupChat,
  v1CreateGroupChat,
  v1GetOrCreateConversationInvite,
  v1JoinConversationByInvite,
  v1JoinPublicGroupChat,
  v1LeaveGroupChat,
  v1ResolveConversationByInvite,
  v1UpdateGroupProfile,
} from '../api/groupsApi'

export type GroupChatSummary = {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
  unreadCount: number
  isPublic: boolean
  publicNick: string | null
  avatarPath: string | null
  avatarThumbPath: string | null
  memberCount: number
  requiredSubscriptionPlan?: string | null
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

export async function createGroupChat(
  title: string,
  isPublic: boolean,
): Promise<{ data: string | null; error: string | null }> {
  return await v1CreateGroupChat(title, isPublic)
}

export async function joinPublicGroupChat(conversationId: string): Promise<{ error: string | null }> {
  return await v1JoinPublicGroupChat(conversationId)
}

export async function leaveGroupChat(conversationId: string): Promise<{ error: string | null }> {
  return await v1LeaveGroupChat(conversationId)
}

export async function addUsersToGroupChat(conversationId: string, userIds: string[]): Promise<{ error: string | null; added: number }> {
  return await v1AddUsersToGroupChat(conversationId, userIds)
}

export async function listMyGroupChats(): Promise<{ data: GroupChatSummary[] | null; error: string | null }> {
  const { data, error } = await v1ListMyGroups()
  if (error || !data) return { data: null, error }
  const rows = Array.isArray(data) ? data : []
  return { data: rows.map((r) => mapGroupRow(r as Record<string, unknown>)).filter((x) => x.id), error: null }
}

export async function updateGroupProfile(args: {
  conversationId: string
  title?: string | null
  publicNick?: string | null
  isPublic?: boolean | null
  avatarPath?: string | null
  avatarThumbPath?: string | null
}): Promise<{ error: string | null }> {
  return await v1UpdateGroupProfile(args.conversationId, {
    title: args.title ?? undefined,
    publicNick: args.publicNick ?? undefined,
    isPublic: args.isPublic ?? undefined,
    avatarPath: args.avatarPath ?? undefined,
    avatarThumbPath: args.avatarThumbPath ?? undefined,
  })
}

export type InviteConversationPreview = {
  id: string
  kind: 'group' | 'channel'
  title: string
  publicNick: string | null
  avatarPath: string | null
  avatarThumbPath: string | null
  memberCount: number
  isPublic: boolean
  postingMode?: 'admins_only' | 'everyone'
  commentsMode?: 'everyone' | 'disabled'
}

function mapInvitePreviewRow(row: Record<string, unknown>): InviteConversationPreview | null {
  const id = typeof row.id === 'string' ? row.id : ''
  const kind = row.kind === 'channel' ? 'channel' : row.kind === 'group' ? 'group' : null
  if (!id || !kind) return null
  return {
    id,
    kind,
    title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : kind === 'channel' ? 'Канал' : 'Группа',
    publicNick: typeof row.public_nick === 'string' && row.public_nick.trim() ? row.public_nick.trim() : null,
    avatarPath: typeof row.avatar_path === 'string' && row.avatar_path.trim() ? row.avatar_path.trim() : null,
    avatarThumbPath:
      typeof row.avatar_thumb_path === 'string' && row.avatar_thumb_path.trim() ? row.avatar_thumb_path.trim() : null,
    memberCount: typeof row.member_count === 'number' ? row.member_count : Number(row.member_count ?? 0) || 0,
    isPublic: row.is_public === true,
    postingMode: row.posting_mode === 'everyone' ? 'everyone' : 'admins_only',
    commentsMode: row.comments_mode === 'disabled' ? 'disabled' : 'everyone',
  }
}

export async function resolveConversationByInvite(token: string): Promise<{ data: InviteConversationPreview | null; error: string | null }> {
  const r = await v1ResolveConversationByInvite(token)
  if (r.error) return { data: null, error: r.error }
  const rows = Array.isArray(r.data) ? r.data : []
  const row = rows[0] as Record<string, unknown> | undefined
  const mapped = row ? mapInvitePreviewRow(row) : null
  return { data: mapped, error: null }
}

export async function joinConversationByInvite(token: string): Promise<{
  data: { conversationId: string; kind: 'group' | 'channel'; joined?: boolean; requested?: boolean } | null
  error: string | null
}> {
  const r = await v1JoinConversationByInvite(token)
  if (r.error || !r.data) return { data: null, error: r.error ?? 'not_joined' }
  const row = r.data as Record<string, unknown>
  const conversationId = typeof row.conversation_id === 'string' ? row.conversation_id : ''
  const kind = row.kind === 'channel' ? 'channel' : 'group'
  if (!conversationId) return { data: null, error: 'not_joined' }
  return { data: { conversationId, kind, joined: true }, error: null }
}

export async function getOrCreateConversationInvite(conversationId: string): Promise<{ data: { token: string } | null; error: string | null }> {
  return await v1GetOrCreateConversationInvite(conversationId)
}

export async function markGroupRead(conversationId: string): Promise<{ error: string | null }> {
  const r = await v1MarkConversationRead(conversationId)
  return { error: r.error }
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
  const r = await v1ListConversationMessagesPage({ conversationId, limit, before: before ?? null })
  if (r.error || !r.data) return { data: null, error: r.error, hasMoreOlder: false }
  const chronological = mapMessagesFromRows(r.data.messages)
  return { data: chronological, error: null, hasMoreOlder: r.data.hasMoreOlder }
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
  args: {
    kind?: 'text' | 'image' | 'audio' | 'system'
    body: string
    meta?: Record<string, unknown> | null
    replyToMessageId?: string | null
  },
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const r = await v1AppendConversationMessage({
    conversationId,
    body: args.body,
    kind: (args.kind ?? 'text') as any,
    meta: args.meta ?? null,
    replyToMessageId: args.replyToMessageId ?? null,
  })
  if (r.error) return { data: null, error: r.error }
  return { data: parseOkMessageResult(r.data), error: null }
}

export type ToggleGroupReactionResult = { action: 'added' | 'removed'; messageId: string; createdAt: string | null }

function parseToggleReaction(data: unknown): ToggleGroupReactionResult | null {
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

export async function toggleGroupMessageReaction(
  conversationId: string,
  targetMessageId: string,
  emoji: ReactionEmoji,
): Promise<{ data: ToggleGroupReactionResult | null; error: string | null }> {
  const r = await v1ToggleConversationReaction({ conversationId, targetMessageId, emoji })
  if (r.error) return { data: null, error: r.error }
  return { data: parseToggleReaction(r.data), error: null }
}

export async function deleteGroupMessage(
  conversationId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  const r = await v1DeleteConversationMessage({ conversationId, messageId })
  if (r.error) return { error: r.error }
  const row = (r.data ?? null) as Record<string, unknown> | null
  if (row && row.ok === true) return { error: null }
  // v1 currently returns `{ ok: true }`; keep fallback message for future richer responses.
  return { error: null }
}

