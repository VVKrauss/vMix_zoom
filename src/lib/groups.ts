import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { mapDirectMessageFromRow, type DirectMessage } from './messenger'
import { apiFetch } from './backend/client'

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
  const res = await apiFetch<{ conversationId: string }>('/groups', {
    method: 'POST',
    body: JSON.stringify({ title, isPublic }),
  })
  if (res.error || !res.data?.conversationId) return { data: null, error: res.error ?? 'not_created' }
  return { data: res.data.conversationId, error: null }
}

export async function joinPublicGroupChat(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true; joined: boolean }>(`/groups/${encodeURIComponent(cid)}/join`, { method: 'POST' })
  return { error: res.error ?? null }
}

export async function leaveGroupChat(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true; left: boolean }>(`/groups/${encodeURIComponent(cid)}/leave`, { method: 'POST' })
  return { error: res.error ?? null }
}

export async function addUsersToGroupChat(conversationId: string, userIds: string[]): Promise<{ error: string | null; added: number }> {
  const cid = conversationId.trim()
  const ids = [...new Set(userIds.map((x) => x.trim()).filter(Boolean))]
  if (!cid) return { error: 'conversation_required', added: 0 }
  if (ids.length === 0) return { error: null, added: 0 }
  const res = await apiFetch<{ ok: true; added: number }>(`/groups/${encodeURIComponent(cid)}/members/add`, {
    method: 'POST',
    body: JSON.stringify({ userIds: ids }),
  })
  if (res.error || !res.data) return { error: res.error ?? 'request_failed', added: 0 }
  return { error: null, added: typeof res.data.added === 'number' ? res.data.added : Number(res.data.added ?? 0) || 0 }
}

export async function listMyGroupChats(): Promise<{ data: GroupChatSummary[] | null; error: string | null }> {
  const res = await apiFetch<{ items: Record<string, unknown>[] }>('/groups')
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed' }
  const rows = Array.isArray(res.data.items) ? res.data.items : []
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
  const cid = args.conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true }>(`/groups/${encodeURIComponent(cid)}/profile`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: args.title ?? null,
      publicNick: args.publicNick ?? null,
      isPublic: args.isPublic ?? null,
      avatarPath: args.avatarPath ?? null,
      avatarThumbPath: args.avatarThumbPath ?? null,
    }),
  })
  return { error: res.error ?? null }
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
  const t = token.trim()
  if (!t) return { data: null, error: 'token_required' }
  const res = await apiFetch<{ ok: true; conversation: Record<string, unknown> }>(`/invites/${encodeURIComponent(t)}`)
  if (res.error || !res.data?.conversation) return { data: null, error: res.error ?? 'request_failed' }
  const c = res.data.conversation
  const mapped: InviteConversationPreview = {
    id: typeof c.id === 'string' ? c.id : String(c.id ?? ''),
    kind: c.kind === 'channel' ? 'channel' : 'group',
    title: typeof c.title === 'string' && c.title.trim() ? c.title.trim() : c.kind === 'channel' ? 'Канал' : 'Группа',
    publicNick: typeof c.publicNick === 'string' && c.publicNick.trim() ? c.publicNick.trim() : null,
    avatarPath: typeof c.avatarPath === 'string' && c.avatarPath.trim() ? c.avatarPath.trim() : null,
    avatarThumbPath: typeof c.avatarThumbPath === 'string' && c.avatarThumbPath.trim() ? c.avatarThumbPath.trim() : null,
    memberCount: typeof c.memberCount === 'number' ? c.memberCount : Number(c.memberCount ?? 0) || 0,
    isPublic: c.isPublic === true,
    postingMode: c.postingMode === 'everyone' ? 'everyone' : 'admins_only',
    commentsMode: c.commentsMode === 'disabled' ? 'disabled' : 'everyone',
  }
  if (!mapped.id) return { data: null, error: 'request_failed' }
  return { data: mapped, error: null }
}

export async function joinConversationByInvite(token: string): Promise<{
  data: { conversationId: string; kind: 'group' | 'channel'; joined?: boolean; requested?: boolean } | null
  error: string | null
}> {
  const t = token.trim()
  if (!t) return { data: null, error: 'token_required' }
  const res = await apiFetch<{ ok: true; conversationId: string; kind: 'group' | 'channel'; joined?: boolean; requested?: boolean }>(
    `/invites/${encodeURIComponent(t)}/join`,
    { method: 'POST' },
  )
  if (res.error || !res.data?.conversationId) return { data: null, error: res.error ?? 'request_failed' }
  return {
    data: {
      conversationId: res.data.conversationId,
      kind: res.data.kind === 'channel' ? 'channel' : 'group',
      joined: res.data.joined,
      requested: res.data.requested,
    },
    error: null,
  }
}

export async function getOrCreateConversationInvite(conversationId: string): Promise<{ data: { token: string } | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const res = await apiFetch<{ ok: true; token: string }>('/invites', {
    method: 'POST',
    body: JSON.stringify({ conversationId: cid }),
  })
  if (res.error || !res.data?.token) return { data: null, error: res.error ?? 'request_failed' }
  return { data: { token: res.data.token }, error: null }
}

export async function markGroupRead(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true }>(`/groups/${encodeURIComponent(cid)}/read`, {
    method: 'POST',
    body: JSON.stringify({ lastReadAt: new Date().toISOString() }),
  })
  return { error: res.error ?? null }
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
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required', hasMoreOlder: false }
  const qs = new URLSearchParams()
  qs.set('limit', String(limit))
  if (before?.createdAt && before?.id) {
    qs.set('beforeCreatedAt', before.createdAt)
    qs.set('beforeId', before.id)
  }
  const res = await apiFetch<{ items: unknown[]; hasMoreOlder: boolean }>(
    `/groups/${encodeURIComponent(cid)}/messages?${qs}`,
  )
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed', hasMoreOlder: false }
  const chronological = mapMessagesFromRows(res.data.items)
  return { data: chronological, error: null, hasMoreOlder: res.data.hasMoreOlder === true }
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
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const res = await apiFetch<{ messageId: string; createdAt: string }>(`/groups/${encodeURIComponent(cid)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      kind: args.kind ?? 'text',
      body: args.body,
      meta: args.meta ?? null,
      replyToMessageId: args.replyToMessageId ?? null,
    }),
  })
  if (res.error || !res.data) return { data: null, error: res.error ?? 'not_sent' }
  return { data: { messageId: res.data.messageId ?? null, createdAt: res.data.createdAt ?? null }, error: null }
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
  const cid = conversationId.trim()
  const tid = targetMessageId.trim()
  if (!cid || !tid) return { data: null, error: 'validation' }
  const res = await apiFetch<{ action: 'added' | 'removed'; messageId: string; createdAt: string | null }>(
    `/groups/${encodeURIComponent(cid)}/reactions/toggle`,
    { method: 'POST', body: JSON.stringify({ targetMessageId: tid, emoji }) },
  )
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed' }
  return { data: { action: res.data.action, messageId: res.data.messageId, createdAt: res.data.createdAt }, error: null }
}

export async function deleteGroupMessage(
  conversationId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const mid = messageId.trim()
  if (!cid || !mid) return { error: 'validation' }
  const res = await apiFetch<{ ok: true; deleted: number }>(`/groups/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`, {
    method: 'DELETE',
  })
  return { error: res.error ?? null }
}

