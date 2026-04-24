import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { mapDirectMessageFromRow, type DirectMessage } from './messenger'
import { apiFetch } from './backend/client'

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
  const res = await apiFetch<{ items: Record<string, unknown>[] }>('/channels')
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed' }
  const rows = Array.isArray(res.data.items) ? res.data.items : []
  return { data: rows.map((r) => mapChannelRow(r as Record<string, unknown>)).filter((x) => x.id), error: null }
}

export async function markChannelRead(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true }>(`/channels/${encodeURIComponent(cid)}/read`, {
    method: 'POST',
    body: JSON.stringify({ lastReadAt: new Date().toISOString() }),
  })
  return { error: res.error ?? null }
}

export async function createChannel(
  title: string,
  opts?: { isPublic?: boolean; postingMode?: 'admins_only' | 'everyone'; commentsMode?: 'everyone' | 'disabled' },
): Promise<{ data: string | null; error: string | null }> {
  const res = await apiFetch<{ conversationId: string }>('/channels', {
    method: 'POST',
    body: JSON.stringify({
      title,
      isPublic: opts?.isPublic ?? false,
      postingMode: opts?.postingMode ?? 'admins_only',
      commentsMode: opts?.commentsMode ?? 'everyone',
    }),
  })
  if (res.error || !res.data?.conversationId) return { data: null, error: res.error ?? 'not_created' }
  return { data: res.data.conversationId, error: null }
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
  const cid = args.conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true }>(`/channels/${encodeURIComponent(cid)}/profile`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: args.title ?? null,
      publicNick: args.publicNick ?? null,
      isPublic: args.isPublic ?? null,
      postingMode: args.postingMode ?? null,
      commentsMode: args.commentsMode ?? null,
      avatarPath: args.avatarPath ?? null,
      avatarThumbPath: args.avatarThumbPath ?? null,
    }),
  })
  return { error: res.error ?? null }
}

export async function joinPublicChannel(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true; joined: boolean }>(`/channels/${encodeURIComponent(cid)}/join`, { method: 'POST' })
  return { error: res.error ?? null }
}

export async function leaveChannel(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'conversation_required' }
  const res = await apiFetch<{ ok: true; left: boolean }>(`/channels/${encodeURIComponent(cid)}/leave`, { method: 'POST' })
  return { error: res.error ?? null }
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
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required', hasMoreOlder: false }
  const qs = new URLSearchParams()
  qs.set('limit', String(limit))
  if (before?.createdAt && before?.id) {
    qs.set('beforeCreatedAt', before.createdAt)
    qs.set('beforeId', before.id)
  }
  const res = await apiFetch<{ items: unknown[]; hasMoreOlder: boolean }>(
    `/channels/${encodeURIComponent(cid)}/posts?${qs}`,
  )
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed', hasMoreOlder: false }
  const chronological = mapMessagesFromRows(res.data.items)
  return { data: chronological, error: null, hasMoreOlder: res.data.hasMoreOlder === true }
}

export async function listChannelCommentsPage(
  conversationId: string,
  postId: string,
  options?: { limit?: number; before?: { createdAt: string; id: string } },
): Promise<{ data: DirectMessage[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 120))
  const before = options?.before
  const cid = conversationId.trim()
  const pid = postId.trim()
  if (!cid || !pid) return { data: null, error: 'validation', hasMoreOlder: false }
  const qs = new URLSearchParams()
  qs.set('postId', pid)
  qs.set('limit', String(limit))
  if (before?.createdAt && before?.id) {
    qs.set('beforeCreatedAt', before.createdAt)
    qs.set('beforeId', before.id)
  }
  const res = await apiFetch<{ items: unknown[]; hasMoreOlder: boolean }>(
    `/channels/${encodeURIComponent(cid)}/comments?${qs}`,
  )
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed', hasMoreOlder: false }
  const chronological = mapMessagesFromRows(res.data.items)
  return { data: chronological, error: null, hasMoreOlder: res.data.hasMoreOlder === true }
}

/** Реакции (kind=reaction) на посты и комментарии — отдельная выборка по meta.react_to. */
export async function listChannelReactionsForTargets(
  conversationId: string,
  targetIds: string[],
): Promise<{ data: DirectMessage[] | null; error: string | null }> {
  const cid = conversationId.trim()
  const ids = [...new Set(targetIds.map((x) => x.trim()).filter(Boolean))]
  if (!cid || ids.length === 0) return { data: [], error: null }
  const qs = new URLSearchParams()
  qs.set('targetIds', ids.join(','))
  const res = await apiFetch<{ items: unknown[] }>(`/channels/${encodeURIComponent(cid)}/reactions?${qs}`)
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed' }
  return { data: mapMessagesFromRows(res.data.items), error: null }
}

export async function listChannelCommentCounts(
  conversationId: string,
  postIds: string[],
): Promise<{ data: Record<string, number> | null; error: string | null }> {
  const cid = conversationId.trim()
  const ids = postIds.map((x) => x.trim()).filter(Boolean)
  if (!cid || ids.length === 0) return { data: {}, error: null }
  const qs = new URLSearchParams()
  qs.set('postIds', ids.join(','))
  const res = await apiFetch<{ counts: Record<string, number> }>(`/channels/${encodeURIComponent(cid)}/comment-counts?${qs}`)
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed' }
  return { data: res.data.counts ?? {}, error: null }
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
  return appendChannelFeedMessage(conversationId, { kind: 'text', body, meta: meta ?? null })
}

/** Лента канала: как сообщение в группе (текст + meta, фото). */
export async function appendChannelFeedMessage(
  conversationId: string,
  args: { kind?: 'text' | 'image' | 'audio'; body: string; meta?: Record<string, unknown> | null },
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }
  const res = await apiFetch<{ messageId: string; createdAt: string }>(`/channels/${encodeURIComponent(cid)}/posts`, {
    method: 'POST',
    body: JSON.stringify({ kind: args.kind ?? 'text', body: args.body, meta: args.meta ?? null }),
  })
  if (res.error || !res.data) return { data: null, error: res.error ?? 'not_sent' }
  return { data: { messageId: res.data.messageId ?? null, createdAt: res.data.createdAt ?? null }, error: null }
}

export async function appendChannelComment(
  conversationId: string,
  postId: string,
  body: string,
  options?: { quoteToMessageId?: string | null },
): Promise<{ data: { messageId: string | null; createdAt: string | null } | null; error: string | null }> {
  void options
  const cid = conversationId.trim()
  const pid = postId.trim()
  if (!cid || !pid) return { data: null, error: 'validation' }
  const res = await apiFetch<{ messageId: string; createdAt: string }>(`/channels/${encodeURIComponent(cid)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ postId: pid, body, meta: null }),
  })
  if (res.error || !res.data) return { data: null, error: res.error ?? 'not_sent' }
  return { data: { messageId: res.data.messageId ?? null, createdAt: res.data.createdAt ?? null }, error: null }
}

export async function editChannelComment(
  conversationId: string,
  messageId: string,
  newBody: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const mid = messageId.trim()
  if (!cid || !mid) return { error: 'validation' }
  const res = await apiFetch<{ ok: true }>(`/channels/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: newBody, meta: null }),
  })
  return { error: res.error ?? null }
}

export async function deleteChannelComment(
  conversationId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const mid = messageId.trim()
  if (!cid || !mid) return { error: 'validation' }
  const res = await apiFetch<{ ok: true; deleted: number }>(
    `/channels/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`,
    { method: 'DELETE' },
  )
  return { error: res.error ?? null }
}

export async function editChannelPostRich(
  conversationId: string,
  messageId: string,
  newBody: string,
  meta: Record<string, unknown> | null,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const mid = messageId.trim()
  if (!cid || !mid) return { error: 'validation' }
  const res = await apiFetch<{ ok: true }>(`/channels/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body: newBody, meta }),
  })
  return { error: res.error ?? null }
}

export async function deleteChannelPost(
  conversationId: string,
  messageId: string,
): Promise<{ error: string | null; deleted: number }> {
  const cid = conversationId.trim()
  const mid = messageId.trim()
  if (!cid || !mid) return { error: 'validation', deleted: 0 }
  const res = await apiFetch<{ ok: true; deleted: number }>(
    `/channels/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}`,
    { method: 'DELETE' },
  )
  return { error: res.error ?? null, deleted: res.data?.deleted ?? 0 }
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
  const cid = conversationId.trim()
  const tid = targetMessageId.trim()
  if (!cid || !tid) return { data: null, error: 'validation' }
  const res = await apiFetch<{ action: 'added' | 'removed'; messageId: string; createdAt: string | null }>(
    `/channels/${encodeURIComponent(cid)}/reactions/toggle`,
    { method: 'POST', body: JSON.stringify({ targetMessageId: tid, emoji }) },
  )
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed' }
  return { data: { action: res.data.action, messageId: res.data.messageId, createdAt: res.data.createdAt }, error: null }
}

