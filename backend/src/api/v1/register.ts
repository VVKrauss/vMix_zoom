import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db.js'
import {
  getMyConversationNotificationMuteRows,
  getContactStatuses,
  listMyContactAliasRows,
  listMyContacts,
  hideContactFromMyList,
  searchRegisteredUsers,
  setUserBlock,
  setUserFavorite,
  setMyContactAlias,
  setMyContactDisplayAvatar,
} from '../../domain/meContacts.js'
import {
  ensureSelfDirectConversation,
  listMyChannels,
  listMyDirectConversations,
  listMyGroupChats,
} from '../../domain/messengerLists.js'
import { listDirectMessagesPage } from '../../domain/directMessages.js'
import {
  appendDirectMessage,
  deleteDirectMessage,
  editDirectMessage,
  markDirectConversationRead,
  toggleDirectMessageReaction,
} from '../../domain/directMessageMutations.js'
import { ensureDirectConversationWithUser } from '../../domain/directConversations.js'
import { getDirectPeerReadReceiptContext } from '../../domain/directPeerReceipts.js'
import {
  appendChannelComment,
  appendChannelFeedMessage,
  appendChannelPostRich,
  createChannel,
  deleteChannelComment,
  deleteChannelPost,
  editChannelComment,
  editChannelPostRich,
  joinPublicChannel,
  leaveChannel,
  listChannelCommentCounts,
  listChannelCommentsPage,
  listChannelPostsPage,
  listChannelReactionsForTargets,
  toggleChannelMessageReaction,
  updateChannelProfile,
} from '../../domain/channels.js'
import {
  approveConversationJoinRequest,
  denyConversationJoinRequest,
  hasPendingConversationJoinRequest,
  listConversationJoinRequests,
  requestConversationJoin,
} from '../../domain/conversationJoinRequests.js'
import {
  listConversationMembersForManagement,
  listConversationStaffMembers,
  removeConversationMemberByStaff,
  setConversationMemberStaffRole,
} from '../../domain/conversationStaff.js'
import { presenceForegroundPulse, presenceMarkBackground } from '../../domain/presence.js'
import { listUserPresencePublicByIds } from '../../domain/presenceMirror.js'
import { getMeProfile, getMyActivePlan, listMyGlobalRoles, patchMeProfile } from '../../domain/meProfile.js'
import { deleteSiteNews, insertSiteNews, listSiteNews, updateSiteNews } from '../../domain/siteNews.js'
import { deletePushSubscription, pushSubscriptionExists, upsertPushSubscription } from '../../domain/pushSubscriptions.js'
import { getAppVersion } from '../../domain/appVersion.js'
import { getUserPublicProfileBySlug } from '../../domain/publicProfiles.js'
import { setConversationNotificationsMuted } from '../../domain/conversationNotifications.js'
import { listConversationMembersForMentions, markMyMentionsRead } from '../../domain/mentions.js'
import { deleteMyAccount } from '../../domain/account.js'
import { addUsersToGroupChat, createGroupChat, joinPublicGroupChat, leaveGroupChat, updateGroupProfile } from '../../domain/groups.js'
import { getOrCreateConversationInvite, joinConversationByInvite, resolveConversationByInvite } from '../../domain/invites.js'

export type ApiV1Deps = {
  db: Db
  requireAuth: (req: unknown) => Promise<{ userId: string }>
}

const uuidIdList = z.object({
  ids: z.array(z.string()).max(500).default([]),
})

const contactStatusesBody = z.object({
  targetUserIds: z.array(z.string()).max(500).default([]),
})

const favoriteBody = z.object({
  targetUserId: z.string().min(1),
  favorite: z.boolean(),
})

const blockBody = z.object({
  targetUserId: z.string().min(1),
  block: z.boolean(),
})

const hideBody = z.object({
  hiddenUserId: z.string().min(1),
})

const searchUsersBody = z.object({
  query: z.string().default(''),
  limit: z.number().int().min(1).max(50).default(20),
})

const emptyObject = z.object({}).strict()

const setAliasBody = z.object({
  contactUserId: z.string().min(1),
  alias: z.string().default(''),
})

const setDisplayAvatarBody = z.object({
  contactUserId: z.string().min(1),
  displayAvatarUrl: z.string().default(''),
})

const listMessagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  beforeCreatedAt: z.string().optional(),
  beforeId: z.string().optional(),
})

const appendMessageBody = z.object({
  body: z.string().default(''),
  kind: z.enum(['text', 'system', 'image', 'audio']).default('text'),
  meta: z.unknown().optional(),
  replyToMessageId: z.string().nullable().optional(),
  quoteToMessageId: z.string().nullable().optional(),
})

const toggleReactionBody = z.object({
  targetMessageId: z.string().min(1),
  emoji: z.string().min(1).max(32),
})

const editMessageBody = z.object({
  newBody: z.string().default(''),
})

const ensureDirectBody = z.object({
  targetUserId: z.string().min(1),
  targetTitle: z.string().nullable().optional(),
})

const createChannelBody = z.object({
  title: z.string().min(1),
  isPublic: z.boolean().default(false),
  postingMode: z.enum(['admins_only', 'everyone']).default('admins_only'),
  commentsMode: z.enum(['everyone', 'disabled']).default('everyone'),
})

const updateChannelBody = z.object({
  title: z.string().nullable().optional(),
  publicNick: z.string().nullable().optional(),
  isPublic: z.boolean().nullable().optional(),
  postingMode: z.enum(['admins_only', 'everyone']).nullable().optional(),
  commentsMode: z.enum(['everyone', 'disabled']).nullable().optional(),
  avatarPath: z.string().nullable().optional(),
  avatarThumbPath: z.string().nullable().optional(),
})

const postsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(80).default(30),
  beforeCreatedAt: z.string().optional(),
  beforeId: z.string().optional(),
})

const commentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(120).default(50),
  beforeCreatedAt: z.string().optional(),
  beforeId: z.string().optional(),
})

const targetIdsBody = z.object({ targetIds: z.array(z.string()).max(500).default([]) })
const postIdsBody = z.object({ postIds: z.array(z.string()).max(500).default([]) })

const appendPostBody = z.object({ body: z.string().default(''), meta: z.unknown().optional() })
const appendFeedBody = z.object({
  kind: z.enum(['text', 'image', 'audio']).default('text'),
  body: z.string().default(''),
  meta: z.unknown().optional(),
})
const appendCommentBody = z.object({
  postId: z.string().min(1),
  body: z.string().default(''),
  quoteToMessageId: z.string().nullable().optional(),
})
const editRichBody = z.object({ newBody: z.string().default(''), meta: z.unknown().optional() })
const editCommentBody = z.object({ newBody: z.string().default('') })
const reactionBody = z.object({ targetMessageId: z.string().min(1), emoji: z.string().min(1).max(32) })

const joinRequestBody = z.object({ conversationId: z.string().min(1) })
const joinRequestIdBody = z.object({ requestId: z.string().min(1) })
const staffRoleBody = z.object({ targetUserId: z.string().min(1), newRole: z.enum(['member', 'moderator', 'admin']) })
const kickBody = z.object({ targetUserId: z.string().min(1) })

/**
 * First-party HTTP API (versioned). New UI work should call these routes instead of `/api/db/*` RPC emulation.
 */
export function registerApiV1(app: FastifyInstance, deps: ApiV1Deps): void {
  app.get('/api/v1/meta', async () => ({
    apiVersion: 1,
    service: 'redflow-api',
    time: new Date().toISOString(),
  }))

  app.get('/api/v1/me/conversations', async (req) => {
    const a = await deps.requireAuth(req)
    const [direct, groups, channels] = await Promise.all([
      listMyDirectConversations(deps.db.pool, a.userId),
      listMyGroupChats(deps.db.pool, a.userId),
      listMyChannels(deps.db.pool, a.userId),
    ])
    return { direct, groups, channels }
  })

  app.get('/api/v1/me/room-chat-conversations', async (req) => {
    const a = await deps.requireAuth(req)
    const Q = z.object({
      limit: z.coerce.number().int().positive().max(100).default(10),
      offset: z.coerce.number().int().min(0).max(10_000).default(0),
    })
    const q = Q.parse((req as any).query ?? {})

    const r = await deps.db.pool.query(
      `
      select
        c.id,
        c.kind,
        c.space_room_slug,
        c.title,
        c.created_at,
        c.closed_at,
        c.last_message_at,
        c.last_message_preview,
        c.message_count
      from public.chat_conversations c
      join public.chat_conversation_members m on m.conversation_id = c.id
      where m.user_id = $1
        and c.kind = 'room'
      order by c.last_message_at desc nulls last, c.created_at desc
      limit $2
      offset $3
      `,
      [a.userId, q.limit + 1, q.offset],
    )

    const rows = r.rows.slice(0, q.limit)
    return { rows, hasMore: r.rows.length > q.limit }
  })

  app.post('/api/v1/me/conversations/self-direct', async (req) => {
    const a = await deps.requireAuth(req)
    emptyObject.parse((req as { body?: unknown }).body ?? {})
    const conversationId = await ensureSelfDirectConversation(deps.db.pool, a.userId)
    return { conversationId }
  })

  app.get('/api/v1/conversations/:conversationId/messages', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const q = listMessagesQuery.parse((req as any).query ?? {})
    const before =
      q.beforeCreatedAt && q.beforeId ? { createdAt: q.beforeCreatedAt, id: q.beforeId } : null
    const { rows } = await listDirectMessagesPage(deps.db.pool, {
      conversationId,
      userId: a.userId,
      limit: q.limit,
      before,
    })
    const chronological = [...rows].reverse()
    const hasMoreOlder = rows.length === q.limit
    return { messages: chronological, hasMoreOlder }
  })

  app.post('/api/v1/conversations/:conversationId/read', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    emptyObject.parse((req as { body?: unknown }).body ?? {})
    const data = await markDirectConversationRead(deps.db.pool, a.userId, conversationId)
    return { data }
  })

  app.post('/api/v1/conversations/:conversationId/messages', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = appendMessageBody.parse((req as { body?: unknown }).body ?? {})
    const data = await appendDirectMessage(deps.db.pool, {
      userId: a.userId,
      conversationId,
      body: body.body,
      kind: body.kind,
      meta: body.meta ?? null,
      replyToMessageId: body.replyToMessageId ?? null,
      quoteToMessageId: body.quoteToMessageId ?? null,
    })
    return { data }
  })

  app.post('/api/v1/conversations/:conversationId/reactions', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = toggleReactionBody.parse((req as { body?: unknown }).body ?? {})
    const data = await toggleDirectMessageReaction(deps.db.pool, {
      userId: a.userId,
      conversationId,
      targetMessageId: body.targetMessageId,
      emoji: body.emoji,
    })
    return { data }
  })

  app.patch('/api/v1/conversations/:conversationId/messages/:messageId', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const messageId = String((req.params as any)?.messageId ?? '').trim()
    const body = editMessageBody.parse((req as { body?: unknown }).body ?? {})
    const data = await editDirectMessage(deps.db.pool, { userId: a.userId, conversationId, messageId, newBody: body.newBody })
    return { data }
  })

  app.delete('/api/v1/conversations/:conversationId/messages/:messageId', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const messageId = String((req.params as any)?.messageId ?? '').trim()
    const data = await deleteDirectMessage(deps.db.pool, { userId: a.userId, conversationId, messageId })
    return { data }
  })

  app.post('/api/v1/me/conversations/direct-with-user', async (req) => {
    const a = await deps.requireAuth(req)
    const body = ensureDirectBody.parse((req as { body?: unknown }).body ?? {})
    const conversationId = await ensureDirectConversationWithUser(deps.db.pool, {
      userId: a.userId,
      targetUserId: body.targetUserId,
      targetTitle: body.targetTitle ?? null,
    })
    return { conversationId }
  })

  app.get('/api/v1/conversations/:conversationId/direct-peer-receipt-context', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const data = await getDirectPeerReadReceiptContext(deps.db.pool, { userId: a.userId, conversationId })
    return { data }
  })

  // --- Channels v1 (replace channel RPC set) ---
  app.post('/api/v1/channels', async (req) => {
    const a = await deps.requireAuth(req)
    const body = createChannelBody.parse((req as { body?: unknown }).body ?? {})
    const id = await createChannel(deps.db.pool, {
      userId: a.userId,
      title: body.title,
      isPublic: body.isPublic,
      postingMode: body.postingMode,
      commentsMode: body.commentsMode,
    })
    return { channelId: id }
  })

  app.patch('/api/v1/channels/:conversationId', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = updateChannelBody.parse((req as { body?: unknown }).body ?? {})
    const data = await updateChannelProfile(deps.db.pool, { userId: a.userId, conversationId, ...body })
    return { data }
  })

  app.post('/api/v1/channels/:conversationId/join', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    emptyObject.parse((req as { body?: unknown }).body ?? {})
    const data = await joinPublicChannel(deps.db.pool, { userId: a.userId, conversationId })
    return { data }
  })

  app.post('/api/v1/channels/:conversationId/leave', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    emptyObject.parse((req as { body?: unknown }).body ?? {})
    const data = await leaveChannel(deps.db.pool, { userId: a.userId, conversationId })
    return { data }
  })

  app.get('/api/v1/channels/:conversationId/posts', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const q = postsQuery.parse((req as any).query ?? {})
    const before = q.beforeCreatedAt && q.beforeId ? { createdAt: q.beforeCreatedAt, id: q.beforeId } : null
    const rows = await listChannelPostsPage(deps.db.pool, { userId: a.userId, conversationId, limit: q.limit, before })
    const chronological = [...rows].reverse()
    return { posts: chronological, hasMoreOlder: rows.length === q.limit }
  })

  app.get('/api/v1/channels/:conversationId/posts/:postId/comments', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const postId = String((req.params as any)?.postId ?? '').trim()
    const q = commentsQuery.parse((req as any).query ?? {})
    const before = q.beforeCreatedAt && q.beforeId ? { createdAt: q.beforeCreatedAt, id: q.beforeId } : null
    const rows = await listChannelCommentsPage(deps.db.pool, { userId: a.userId, conversationId, postId, limit: q.limit, before })
    const chronological = [...rows].reverse()
    return { comments: chronological, hasMoreOlder: rows.length === q.limit }
  })

  app.post('/api/v1/channels/:conversationId/reactions-for-targets', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = targetIdsBody.parse((req as { body?: unknown }).body ?? {})
    const rows = await listChannelReactionsForTargets(deps.db.pool, { userId: a.userId, conversationId, targetIds: body.targetIds })
    return { rows }
  })

  app.post('/api/v1/channels/:conversationId/comment-counts', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = postIdsBody.parse((req as { body?: unknown }).body ?? {})
    const rows = await listChannelCommentCounts(deps.db.pool, { userId: a.userId, conversationId, postIds: body.postIds })
    return { rows }
  })

  app.post('/api/v1/channels/:conversationId/posts', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = appendPostBody.parse((req as { body?: unknown }).body ?? {})
    const data = await appendChannelPostRich(deps.db.pool, { userId: a.userId, conversationId, body: body.body, meta: body.meta ?? null })
    return { data }
  })

  app.post('/api/v1/channels/:conversationId/feed', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = appendFeedBody.parse((req as { body?: unknown }).body ?? {})
    const data = await appendChannelFeedMessage(deps.db.pool, { userId: a.userId, conversationId, kind: body.kind, body: body.body, meta: body.meta ?? null })
    return { data }
  })

  app.post('/api/v1/channels/:conversationId/comments', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = appendCommentBody.parse((req as { body?: unknown }).body ?? {})
    const data = await appendChannelComment(deps.db.pool, {
      userId: a.userId,
      conversationId,
      postId: body.postId,
      body: body.body,
      quoteToMessageId: body.quoteToMessageId ?? null,
    })
    return { data }
  })

  app.patch('/api/v1/channels/:conversationId/comments/:messageId', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const messageId = String((req.params as any)?.messageId ?? '').trim()
    const body = editCommentBody.parse((req as { body?: unknown }).body ?? {})
    const data = await editChannelComment(deps.db.pool, { userId: a.userId, conversationId, messageId, newBody: body.newBody })
    return { data }
  })

  app.delete('/api/v1/channels/:conversationId/comments/:messageId', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const messageId = String((req.params as any)?.messageId ?? '').trim()
    const data = await deleteChannelComment(deps.db.pool, { userId: a.userId, conversationId, messageId })
    return { data }
  })

  app.patch('/api/v1/channels/:conversationId/posts/:messageId', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const messageId = String((req.params as any)?.messageId ?? '').trim()
    const body = editRichBody.parse((req as { body?: unknown }).body ?? {})
    const data = await editChannelPostRich(deps.db.pool, { userId: a.userId, conversationId, messageId, newBody: body.newBody, meta: body.meta ?? null })
    return { data }
  })

  app.delete('/api/v1/channels/:conversationId/posts/:messageId', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const messageId = String((req.params as any)?.messageId ?? '').trim()
    const data = await deleteChannelPost(deps.db.pool, { userId: a.userId, conversationId, messageId })
    return { data }
  })

  app.post('/api/v1/channels/:conversationId/reactions', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = reactionBody.parse((req as { body?: unknown }).body ?? {})
    const data = await toggleChannelMessageReaction(deps.db.pool, { userId: a.userId, conversationId, targetMessageId: body.targetMessageId, emoji: body.emoji })
    return { data }
  })

  // --- Join requests + staff management (groups/channels) ---
  app.get('/api/v1/me/conversation-join-requests/:conversationId/pending', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const pending = await hasPendingConversationJoinRequest(deps.db.pool, { userId: a.userId, conversationId })
    return { pending }
  })

  app.post('/api/v1/me/conversation-join-requests', async (req) => {
    const a = await deps.requireAuth(req)
    const body = joinRequestBody.parse((req as { body?: unknown }).body ?? {})
    const data = await requestConversationJoin(deps.db.pool, { userId: a.userId, conversationId: body.conversationId })
    return { data }
  })

  app.get('/api/v1/conversations/:conversationId/join-requests', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const rows = await listConversationJoinRequests(deps.db.pool, { userId: a.userId, conversationId })
    return { rows }
  })

  app.post('/api/v1/conversation-join-requests/approve', async (req) => {
    const a = await deps.requireAuth(req)
    const body = joinRequestIdBody.parse((req as { body?: unknown }).body ?? {})
    const data = await approveConversationJoinRequest(deps.db.pool, { userId: a.userId, requestId: body.requestId })
    return { data }
  })

  app.post('/api/v1/conversation-join-requests/deny', async (req) => {
    const a = await deps.requireAuth(req)
    const body = joinRequestIdBody.parse((req as { body?: unknown }).body ?? {})
    const data = await denyConversationJoinRequest(deps.db.pool, { userId: a.userId, requestId: body.requestId })
    return { data }
  })

  app.get('/api/v1/conversations/:conversationId/members/management', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const rows = await listConversationMembersForManagement(deps.db.pool, { userId: a.userId, conversationId })
    return { rows }
  })

  app.post('/api/v1/conversations/:conversationId/members/kick', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = kickBody.parse((req as { body?: unknown }).body ?? {})
    const data = await removeConversationMemberByStaff(deps.db.pool, { userId: a.userId, conversationId, targetUserId: body.targetUserId })
    return { data }
  })

  app.get('/api/v1/conversations/:conversationId/staff', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const rows = await listConversationStaffMembers(deps.db.pool, { userId: a.userId, conversationId })
    return { rows }
  })

  app.post('/api/v1/conversations/:conversationId/staff/role', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = staffRoleBody.parse((req as { body?: unknown }).body ?? {})
    const data = await setConversationMemberStaffRole(deps.db.pool, {
      userId: a.userId,
      conversationId,
      targetUserId: body.targetUserId,
      newRole: body.newRole,
    })
    return { data }
  })

  // --- Presence (foreground/background) ---
  app.post('/api/v1/me/presence/foreground-pulse', async (req) => {
    const a = await deps.requireAuth(req)
    emptyObject.parse((req as { body?: unknown }).body ?? {})
    await presenceForegroundPulse(deps.db.pool, a.userId)
    return { ok: true }
  })

  app.post('/api/v1/me/presence/mark-background', async (req) => {
    const a = await deps.requireAuth(req)
    emptyObject.parse((req as { body?: unknown }).body ?? {})
    await presenceMarkBackground(deps.db.pool, a.userId)
    return { ok: true }
  })

  app.get('/api/v1/presence/public', async (req) => {
    const a = await deps.requireAuth(req)
    const q = z
      .object({
        ids: z.string().default(''),
      })
      .parse((req as any).query ?? {})
    const ids = q.ids
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 200)
    // Same spirit as legacy: allow either self or explicit ids list.
    if (!ids.length) return { rows: [] }
    const rows = await listUserPresencePublicByIds(deps.db.pool, a.userId, ids)
    return { rows }
  })

  // --- Me profile (replace supabase.from('users') for self) ---
  app.get('/api/v1/me/profile', async (req) => {
    const a = await deps.requireAuth(req)
    const profile = await getMeProfile(deps.db.pool, a.userId)
    const roles = await listMyGlobalRoles(deps.db.pool, a.userId)
    const plan = await getMyActivePlan(deps.db.pool, a.userId)
    return { profile, roles, plan }
  })

  app.patch('/api/v1/me/profile', async (req) => {
    const a = await deps.requireAuth(req)
    const body = z.record(z.string(), z.unknown()).parse((req as { body?: unknown }).body ?? {})
    await patchMeProfile(deps.db.pool, { userId: a.userId, patch: body })
    return { ok: true }
  })

  // --- Site news ---
  app.get('/api/v1/site-news', async () => {
    const rows = await listSiteNews(deps.db.pool)
    return { rows }
  })

  const siteNewsBody = z.object({
    published_at: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    image_url: z.string().nullable().optional(),
  })

  async function assertStaff(req: any): Promise<void> {
    const a = await deps.requireAuth(req)
    const r = await deps.db.pool.query<{ code: string }>(
      `select r.code
         from public.user_global_roles ugr
         join public.roles r on r.id = ugr.role_id
        where ugr.user_id = $1 and r.scope_type = 'global'`,
      [a.userId],
    )
    const codes = new Set(r.rows.map((x) => x.code))
    const ok = codes.has('superadmin') || codes.has('platform_admin') || codes.has('support_admin')
    if (!ok) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
  }

  // --- App version ---
  app.get('/api/v1/app-version', async () => {
    const version = await getAppVersion(deps.db.pool)
    return { version }
  })

  app.post('/api/v1/site-news', async (req) => {
    await assertStaff(req)
    const body = siteNewsBody.parse((req as { body?: unknown }).body ?? {})
    await insertSiteNews(deps.db.pool, {
      published_at: body.published_at,
      title: body.title,
      body: body.body,
      image_url: body.image_url ?? null,
    })
    return { ok: true }
  })

  app.patch('/api/v1/site-news/:id', async (req) => {
    await assertStaff(req)
    const id = String((req.params as any)?.id ?? '').trim()
    const body = siteNewsBody.parse((req as { body?: unknown }).body ?? {})
    await updateSiteNews(deps.db.pool, {
      id,
      published_at: body.published_at,
      title: body.title,
      body: body.body,
      image_url: body.image_url ?? null,
    })
    return { ok: true }
  })

  app.delete('/api/v1/site-news/:id', async (req) => {
    await assertStaff(req)
    const id = String((req.params as any)?.id ?? '').trim()
    await deleteSiteNews(deps.db.pool, id)
    return { ok: true }
  })

  // --- Web Push subscriptions (self) ---
  const pushUpsertBody = z.object({
    endpoint: z.string().min(1),
    subscription: z.unknown(),
    user_agent: z.string().nullable().optional(),
  })

  app.get('/api/v1/me/push-subscriptions/exists', async (req) => {
    const a = await deps.requireAuth(req)
    const q = z.object({ endpoint: z.string().min(1) }).parse((req as any).query ?? {})
    const exists = await pushSubscriptionExists(deps.db.pool, { userId: a.userId, endpoint: q.endpoint })
    return { exists }
  })

  app.post('/api/v1/me/push-subscriptions', async (req) => {
    const a = await deps.requireAuth(req)
    const body = pushUpsertBody.parse((req as any).body ?? {})
    await upsertPushSubscription(deps.db.pool, {
      userId: a.userId,
      endpoint: body.endpoint,
      subscription: body.subscription,
      userAgent: body.user_agent ?? null,
    })
    return { ok: true }
  })

  app.delete('/api/v1/me/push-subscriptions', async (req) => {
    const a = await deps.requireAuth(req)
    const q = z.object({ endpoint: z.string().min(1) }).parse((req as any).query ?? {})
    await deletePushSubscription(deps.db.pool, { userId: a.userId, endpoint: q.endpoint })
    return { ok: true }
  })

  // --- Public profiles ---
  app.get('/api/v1/users/public/by-slug/:slug', async (req) => {
    const slug = String((req.params as any)?.slug ?? '').trim()
    let viewerId: string | null = null
    try {
      const a = await deps.requireAuth(req)
      viewerId = a.userId
    } catch {
      viewerId = null
    }
    const data = await getUserPublicProfileBySlug(deps.db.pool, { viewerId, slug })
    return { data }
  })

  // --- Conversation notifications mute (toggle) ---
  app.post('/api/v1/me/conversations/:conversationId/notifications-muted', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = z.object({ muted: z.boolean() }).parse((req as any).body ?? {})
    const data = await setConversationNotificationsMuted(deps.db.pool, { userId: a.userId, conversationId, muted: body.muted })
    return { data }
  })

  // --- Mentions ---
  app.get('/api/v1/conversations/:conversationId/mention-picks', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const rows = await listConversationMembersForMentions(deps.db.pool, { userId: a.userId, conversationId })
    return { rows }
  })

  app.get('/api/v1/conversations/:conversationId/members/basic', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    if (!conversationId) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })

    const mem = await deps.db.pool.query(
      `select 1 from public.chat_conversation_members where conversation_id = $1 and user_id = $2 limit 1`,
      [conversationId, a.userId],
    )
    if (!mem.rowCount) throw Object.assign(new Error('forbidden'), { statusCode: 403 })

    const r = await deps.db.pool.query(
      `
      select u.id as user_id, u.display_name, u.avatar_url
        from public.chat_conversation_members m
        join public.users u on u.id = m.user_id
       where m.conversation_id = $1
       order by u.display_name asc
      `,
      [conversationId],
    )
    return { rows: r.rows }
  })

  app.post('/api/v1/conversations/:conversationId/mentions/read', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    emptyObject.parse((req as any).body ?? {})
    await markMyMentionsRead(deps.db.pool, { userId: a.userId, conversationId })
    return { ok: true }
  })

  // --- Account lifecycle ---
  app.post('/api/v1/me/delete-account', async (req) => {
    const a = await deps.requireAuth(req)
    emptyObject.parse((req as any).body ?? {})
    const data = await deleteMyAccount(deps.db.pool, a.userId)
    return { data }
  })

  // --- Groups ---
  const createGroupBody = z.object({ title: z.string().min(1), isPublic: z.boolean().default(false) })
  app.post('/api/v1/groups', async (req) => {
    const a = await deps.requireAuth(req)
    const body = createGroupBody.parse((req as any).body ?? {})
    const id = await createGroupChat(deps.db.pool, { userId: a.userId, title: body.title, isPublic: body.isPublic })
    return { conversationId: id }
  })
  app.post('/api/v1/groups/:conversationId/join', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    emptyObject.parse((req as any).body ?? {})
    const data = await joinPublicGroupChat(deps.db.pool, { userId: a.userId, conversationId })
    return { data }
  })
  app.post('/api/v1/groups/:conversationId/leave', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    emptyObject.parse((req as any).body ?? {})
    const data = await leaveGroupChat(deps.db.pool, { userId: a.userId, conversationId })
    return { data }
  })
  app.post('/api/v1/groups/:conversationId/add-users', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = z.object({ userIds: z.array(z.string()).default([]) }).parse((req as any).body ?? {})
    const data = await addUsersToGroupChat(deps.db.pool, { userId: a.userId, conversationId, userIds: body.userIds })
    return { data }
  })
  app.patch('/api/v1/groups/:conversationId/profile', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    const body = z
      .object({
        title: z.string().nullable().optional(),
        publicNick: z.string().nullable().optional(),
        isPublic: z.boolean().nullable().optional(),
        avatarPath: z.string().nullable().optional(),
        avatarThumbPath: z.string().nullable().optional(),
      })
      .parse((req as any).body ?? {})
    const data = await updateGroupProfile(deps.db.pool, { userId: a.userId, conversationId, ...body })
    return { data }
  })

  // --- Invites ---
  app.get('/api/v1/invites/:token/preview', async (req) => {
    await deps.requireAuth(req)
    const token = String((req.params as any)?.token ?? '').trim()
    const rows = await resolveConversationByInvite(deps.db.pool, token)
    return { rows }
  })
  app.post('/api/v1/invites/:token/join', async (req) => {
    const a = await deps.requireAuth(req)
    const token = String((req.params as any)?.token ?? '').trim()
    emptyObject.parse((req as any).body ?? {})
    const data = await joinConversationByInvite(deps.db.pool, { userId: a.userId, token })
    return { data }
  })
  app.post('/api/v1/conversations/:conversationId/invite', async (req) => {
    const a = await deps.requireAuth(req)
    const conversationId = String((req.params as any)?.conversationId ?? '').trim()
    emptyObject.parse((req as any).body ?? {})
    const data = await getOrCreateConversationInvite(deps.db.pool, { userId: a.userId, conversationId })
    return { data }
  })

  app.get('/api/v1/me/contacts', async (req) => {
    const a = await deps.requireAuth(req)
    const contacts = await listMyContacts(deps.db.pool, a.userId)
    return { contacts }
  })

  app.post('/api/v1/me/contact-statuses', async (req) => {
    const a = await deps.requireAuth(req)
    const body = contactStatusesBody.parse((req as { body?: unknown }).body ?? {})
    const rows = await getContactStatuses(deps.db.pool, a.userId, body.targetUserIds)
    return { rows }
  })

  app.post('/api/v1/me/favorites', async (req) => {
    const a = await deps.requireAuth(req)
    const body = favoriteBody.parse((req as { body?: unknown }).body ?? {})
    const data = await setUserFavorite(deps.db.pool, a.userId, body.targetUserId, body.favorite)
    return { data }
  })

  app.post('/api/v1/me/blocks', async (req) => {
    const a = await deps.requireAuth(req)
    const body = blockBody.parse((req as { body?: unknown }).body ?? {})
    const data = await setUserBlock(deps.db.pool, a.userId, body.targetUserId, body.block)
    return { data }
  })

  app.post('/api/v1/me/contact-list-hides', async (req) => {
    const a = await deps.requireAuth(req)
    const body = hideBody.parse((req as { body?: unknown }).body ?? {})
    const data = await hideContactFromMyList(deps.db.pool, a.userId, body.hiddenUserId)
    return { data }
  })

  app.post('/api/v1/users/search', async (req) => {
    const a = await deps.requireAuth(req)
    const body = searchUsersBody.parse((req as { body?: unknown }).body ?? {})
    const rows = await searchRegisteredUsers(deps.db.pool, a.userId, body.query, body.limit)
    return { rows }
  })

  app.post('/api/v1/me/contact-aliases', async (req) => {
    const a = await deps.requireAuth(req)
    const body = uuidIdList.parse((req as { body?: unknown }).body ?? {})
    const rows = await listMyContactAliasRows(deps.db.pool, a.userId, body.ids)
    return { rows }
  })

  app.post('/api/v1/me/contact-alias', async (req) => {
    const a = await deps.requireAuth(req)
    const body = setAliasBody.parse((req as { body?: unknown }).body ?? {})
    const data = await setMyContactAlias(deps.db.pool, a.userId, body.contactUserId, body.alias)
    return { data }
  })

  app.post('/api/v1/me/contact-display-avatar', async (req) => {
    const a = await deps.requireAuth(req)
    const body = setDisplayAvatarBody.parse((req as { body?: unknown }).body ?? {})
    const data = await setMyContactDisplayAvatar(deps.db.pool, a.userId, body.contactUserId, body.displayAvatarUrl)
    return { data }
  })

  app.post('/api/v1/me/conversation-notification-mutes', async (req) => {
    const a = await deps.requireAuth(req)
    const body = uuidIdList.parse((req as { body?: unknown }).body ?? {})
    const rows = await getMyConversationNotificationMuteRows(deps.db.pool, a.userId, body.ids)
    return { rows }
  })
}
