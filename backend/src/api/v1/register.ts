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
import { getWebPushConfigStatus, sendWebPushToUser } from '../../push/webPush.js'
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
  async function requireStaff(req: unknown): Promise<{ userId: string; superadmin: boolean }> {
    const a = await deps.requireAuth(req)
    const r = await deps.db.pool.query<{ code: string }>(
      `select r.code
         from public.user_global_roles ugr
         join public.roles r on r.id = ugr.role_id
        where ugr.user_id = $1 and r.scope_type = 'global'`,
      [a.userId],
    )
    const codes = new Set(r.rows.map((x) => x.code))
    const superadmin = codes.has('superadmin')
    const staff = superadmin || codes.has('platform_admin') || codes.has('support_admin')
    if (!staff) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
    return { userId: a.userId, superadmin }
  }

  app.get('/api/v1/meta', async () => ({
    apiVersion: 1,
    service: 'redflow-api',
    time: new Date().toISOString(),
  }))

  // --- Public discovery (no legacy RPC) ---
  app.get('/api/v1/public/conversations/search', async (req) => {
    await deps.requireAuth(req)
    const Q = z.object({
      query: z.string().default(''),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    })
    const q = Q.parse((req as any).query ?? {})
    const query = q.query.trim()
    const limit = q.limit
    const like = `%${query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`

    const r = await deps.db.pool.query(
      `
      select
        c.id,
        c.kind,
        c.title,
        c.created_at,
        c.last_message_at,
        c.last_message_preview,
        c.public_nick,
        c.avatar_path,
        c.avatar_thumb_path,
        c.required_subscription_plan,
        (select count(*)::int from public.chat_conversation_members m where m.conversation_id = c.id) as member_count,
        case when c.kind='channel' then c.channel_is_public else c.group_is_public end as is_public,
        coalesce(c.channel_posting_mode, 'admins_only') as posting_mode,
        coalesce(c.channel_comments_mode, 'everyone') as comments_mode
      from public.chat_conversations c
      where c.kind in ('group','channel')
        and (case when c.kind='channel' then c.channel_is_public else c.group_is_public end) = true
        and (
          $1 = ''
          or c.title ilike $2 escape '\\'
          or c.public_nick ilike $2 escape '\\'
        )
      order by c.last_message_at desc nulls last, c.created_at desc
      limit $3
      `,
      [query, like, limit],
    )
    return { rows: r.rows }
  })

  app.get('/api/v1/public/conversations/guest-preview', async (req) => {
    const Q = z.object({
      publicNick: z.string().default(''),
      messageLimit: z.coerce.number().int().min(1).max(80).default(40),
    })
    const q = Q.parse((req as any).query ?? {})
    const nick = q.publicNick.trim()
    if (!nick) return { ok: false, error: 'invalid_nick' as const }

    const conv = await deps.db.pool.query(
      `
      select
        id,
        kind,
        title,
        public_nick,
        avatar_path,
        avatar_thumb_path,
        required_subscription_plan,
        channel_posting_mode,
        channel_comments_mode,
        channel_is_public,
        group_is_public,
        (select count(*)::int from public.chat_conversation_members m where m.conversation_id = c.id) as member_count
      from public.chat_conversations c
      where public_nick = $1
        and kind in ('group','channel')
      limit 1
      `,
      [nick],
    )
    const c = conv.rows[0] as any
    if (!c?.id) return { ok: false, error: 'not_found' as const }
    const isPublic = c.kind === 'channel' ? c.channel_is_public === true : c.group_is_public === true
    if (!isPublic) return { ok: false, error: 'not_public' as const }

    const msgs = await deps.db.pool.query(
      `
      select id, sender_user_id, sender_peer_id, sender_name_snapshot, kind, body, meta, created_at, edited_at, reply_to_message_id, quote_to_message_id
        from public.chat_messages
       where conversation_id = $1
         and kind in ('text','system','image','audio')
       order by created_at desc, id desc
       limit $2
      `,
      [c.id, q.messageLimit],
    )

    return {
      ok: true,
      conversation_id: c.id,
      kind: c.kind,
      title: c.title,
      public_nick: c.public_nick,
      member_count: c.member_count ?? 0,
      avatar_path: c.avatar_path ?? null,
      avatar_thumb_path: c.avatar_thumb_path ?? null,
      channel_posting_mode: c.channel_posting_mode ?? null,
      channel_comments_mode: c.channel_comments_mode ?? null,
      messages: [...msgs.rows].reverse(),
    }
  })

  // --- Public profile slug helpers (no legacy DB facade) ---
  app.get('/api/v1/public/profile-slug/:slug/owner', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    if (!slug) return { userId: null }
    const r = await deps.db.pool.query<{ id: string }>(`select id from public.users where profile_slug=$1 limit 1`, [slug])
    return { userId: r.rows[0]?.id ?? null }
  })

  app.post('/api/v1/me/profile/assign-auto-slug-if-empty', async (req) => {
    const a = await deps.requireAuth(req)
    emptyObject.parse((req as any).body ?? {})

    const existing = await deps.db.pool.query<{ profile_slug: string | null }>(
      `select profile_slug from public.users where id=$1 limit 1`,
      [a.userId],
    )
    const cur = existing.rows[0]?.profile_slug?.trim() ?? ''
    if (cur) return { ok: true, slug: cur }

    function buildAutoSlug(seed: number): string {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
      let x = seed >>> 0
      let s = 'u_'
      for (let i = 0; i < 10; i++) {
        x = (x * 1664525 + 1013904223) >>> 0
        s += alphabet[x % alphabet.length]
      }
      return s
    }

    const now = Date.now()
    for (let i = 0; i < 14; i++) {
      const candidate = buildAutoSlug(now + i * 17)
      const upd = await deps.db.pool.query(
        `update public.users set profile_slug=$1, updated_at=now()
          where id=$2 and profile_slug is null`,
        [candidate, a.userId],
      )
      if (upd.rowCount === 1) return { ok: true, slug: candidate }
      // someone else might have filled it, re-check
      const again = await deps.db.pool.query<{ profile_slug: string | null }>(
        `select profile_slug from public.users where id=$1 limit 1`,
        [a.userId],
      )
      const v = again.rows[0]?.profile_slug?.trim() ?? ''
      if (v) return { ok: true, slug: v }
    }
    return { ok: false, error: 'no_free_slug' }
  })

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

  app.get('/api/v1/me/room-chat-conversations/:conversationId', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
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
        and c.id = $2
        and c.kind = 'room'
      limit 1
      `,
      [a.userId, cid],
    )
    const row = r.rows[0]
    return { row: row ?? null }
  })

  app.post('/api/v1/me/room-chat-conversations/:conversationId/leave', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
    emptyObject.parse((req as any).body ?? {})

    // Must be a member of a room-chat conversation.
    const c = await deps.db.pool.query<{ kind: string }>(
      `select kind from public.chat_conversations where id = $1 limit 1`,
      [cid],
    )
    if (c.rows[0]?.kind !== 'room') return { ok: false, error: 'not_room' }

    const del = await deps.db.pool.query(
      `delete from public.chat_conversation_members where conversation_id = $1 and user_id = $2`,
      [cid, a.userId],
    )
    if (!del.rowCount) return { ok: false, error: 'not_member' }

    // If there are no messages OR no members left — delete the conversation.
    const msg = await deps.db.pool.query(`select 1 from public.chat_messages where conversation_id = $1 limit 1`, [cid])
    const mem = await deps.db.pool.query(`select 1 from public.chat_conversation_members where conversation_id = $1 limit 1`, [cid])
    const hasMessages = (msg.rowCount ?? 0) > 0
    const hasMembers = (mem.rowCount ?? 0) > 0
    let removedConversation = false
    if (!hasMessages || !hasMembers) {
      await deps.db.pool.query(`delete from public.chat_messages where conversation_id = $1`, [cid])
      await deps.db.pool.query(`delete from public.chat_conversation_members where conversation_id = $1`, [cid])
      await deps.db.pool.query(`delete from public.chat_conversations where id = $1`, [cid])
      removedConversation = true
    }

    return { ok: true, removedConversation }
  })

  app.post('/api/v1/me/conversations/self-direct', async (req) => {
    const a = await deps.requireAuth(req)
    emptyObject.parse((req as { body?: unknown }).body ?? {})
    const conversationId = await ensureSelfDirectConversation(deps.db.pool, a.userId)
    return { conversationId }
  })

  // --- Space rooms: settings + host tools (no legacy DB facade) ---
  app.get('/api/v1/space-rooms/:slug/settings', async (req) => {
    await deps.requireAuth(req)
    const slug = String((req.params as any).slug ?? '').trim()
    if (!slug) throw Object.assign(new Error('bad_slug'), { statusCode: 400 })
    const r = await deps.db.pool.query(
      `
      select
        slug,
        host_user_id,
        chat_visibility,
        access_mode,
        status,
        room_admin_user_ids
      from public.space_rooms
      where slug = $1
      limit 1
      `,
      [slug],
    )
    return { row: r.rows[0] ?? null }
  })

  async function requireRoomHostOrStaff(req: any, slug: string): Promise<{ actorUserId: string; isStaff: boolean }> {
    const a = await deps.requireAuth(req)
    const staff = await requireStaff(req).then(() => true).catch(() => false)
    if (staff) return { actorUserId: a.userId, isStaff: true }
    const r = await deps.db.pool.query<{ host_user_id: string }>(`select host_user_id from public.space_rooms where slug=$1 limit 1`, [slug])
    if (!r.rows[0]) throw Object.assign(new Error('not_found'), { statusCode: 404 })
    if (String(r.rows[0].host_user_id) !== a.userId) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
    return { actorUserId: a.userId, isStaff: false }
  }

  app.post('/api/v1/space-rooms', async (req) => {
    const a = await deps.requireAuth(req)
    const Body = z.object({
      slug: z.string().min(1).max(64),
      lifecycle: z.enum(['permanent', 'temporary']),
      chatVisibility: z.enum(['everyone', 'authenticated_only', 'staff_only', 'closed']),
      displayName: z.string().max(160).nullable().optional(),
      avatarUrl: z.string().max(2048).nullable().optional(),
      guestPolicy: z.record(z.string(), z.unknown()).nullable().optional(),
      requireCreatorHostForJoin: z.boolean().optional(),
    })
    const body = Body.parse((req as any).body ?? {})
    const slug = body.slug.trim()
    if (!slug) throw Object.assign(new Error('bad_slug'), { statusCode: 400 })

    const ins = await deps.db.pool.query(
      `
      insert into public.space_rooms (slug, host_user_id, retain_instance, chat_visibility, display_name, avatar_url, guest_policy, require_creator_host_for_join)
      values ($1,$2,$3,$4,$5,$6,coalesce($7,'{}'::jsonb),$8)
      `,
      [
        slug,
        a.userId,
        body.lifecycle === 'permanent',
        body.chatVisibility,
        body.displayName ?? null,
        body.avatarUrl ?? null,
        body.guestPolicy ?? {},
        body.requireCreatorHostForJoin === true,
      ],
    ).catch((e) => {
      // unique violation -> slug already taken
      if (String(e?.code ?? '') === '23505') return null
      throw e
    })
    if (!ins) return { ok: false, error: 'slug_taken' }
    return { ok: true }
  })

  app.get('/api/v1/me/space-rooms/persistent', async (req) => {
    const a = await deps.requireAuth(req)
    const r = await deps.db.pool.query(
      `
      select
        slug,
        status,
        access_mode,
        chat_visibility,
        created_at,
        display_name,
        avatar_url,
        guest_policy,
        require_creator_host_for_join,
        cumulative_open_seconds,
        open_session_started_at
      from public.space_rooms
      where host_user_id = $1
        and retain_instance = true
      order by created_at desc nulls last, slug asc
      limit 200
      `,
      [a.userId],
    )
    return { rows: r.rows }
  })

  app.get('/api/v1/public/space-rooms/:slug/join-info', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    if (!slug) throw Object.assign(new Error('bad_slug'), { statusCode: 400 })
    const r = await deps.db.pool.query(
      `select status,host_user_id,retain_instance,access_mode,created_at,banned_user_ids,approved_joiners
         from public.space_rooms where slug=$1 limit 1`,
      [slug],
    )
    return { row: r.rows[0] ?? null }
  })

  app.patch('/api/v1/space-rooms/:slug/chat-visibility', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    const Body = z.object({ chatVisibility: z.enum(['everyone', 'authenticated_only', 'staff_only', 'closed']) })
    const body = Body.parse((req as any).body ?? {})
    await deps.db.pool.query(`update public.space_rooms set chat_visibility=$1, updated_at=now() where slug=$2`, [
      body.chatVisibility,
      slug,
    ])
    return { ok: true }
  })

  app.patch('/api/v1/space-rooms/:slug/access-mode', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    const Body = z.object({ accessMode: z.enum(['link', 'approval', 'invite_only']) })
    const body = Body.parse((req as any).body ?? {})
    await deps.db.pool.query(`update public.space_rooms set access_mode=$1, updated_at=now() where slug=$2`, [body.accessMode, slug])
    return { ok: true }
  })

  app.post('/api/v1/space-rooms/:slug/host-leave', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    emptyObject.parse((req as any).body ?? {})
    await deps.db.pool.query(`update public.space_rooms set status='closed', updated_at=now() where slug=$1`, [slug])
    return { ok: true }
  })

  app.post('/api/v1/space-rooms/:slug/ban', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    const Body = z.object({ targetUserId: z.string().min(1) })
    const body = Body.parse((req as any).body ?? {})
    await deps.db.pool.query(
      `update public.space_rooms
          set banned_user_ids = (select array_agg(distinct x) from unnest(banned_user_ids || $1::uuid) x),
              updated_at = now()
        where slug=$2`,
      [body.targetUserId, slug],
    )
    return { ok: true }
  })

  app.post('/api/v1/space-rooms/:slug/approve-joiner', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    const Body = z.object({ targetUserId: z.string().min(1) })
    const body = Body.parse((req as any).body ?? {})
    await deps.db.pool.query(
      `update public.space_rooms
          set approved_joiners = (select array_agg(distinct x) from unnest(approved_joiners || $1::uuid) x),
              updated_at = now()
        where slug=$2`,
      [body.targetUserId, slug],
    )
    return { ok: true }
  })

  app.post('/api/v1/space-rooms/:slug/remove-approved-joiner', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    const Body = z.object({ targetUserId: z.string().min(1) })
    const body = Body.parse((req as any).body ?? {})
    await deps.db.pool.query(
      `update public.space_rooms
          set approved_joiners = array_remove(approved_joiners, $1::uuid),
              updated_at = now()
        where slug=$2`,
      [body.targetUserId, slug],
    )
    return { ok: true }
  })

  app.post('/api/v1/space-rooms/:slug/admins/add', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    const Body = z.object({ targetUserId: z.string().min(1) })
    const body = Body.parse((req as any).body ?? {})
    await deps.db.pool.query(
      `update public.space_rooms
          set room_admin_user_ids = (select array_agg(distinct x) from unnest(room_admin_user_ids || $1::uuid) x),
              updated_at = now()
        where slug=$2`,
      [body.targetUserId, slug],
    )
    return { ok: true }
  })

  app.post('/api/v1/space-rooms/:slug/admins/remove', async (req) => {
    const slug = String((req.params as any).slug ?? '').trim()
    await requireRoomHostOrStaff(req, slug)
    const Body = z.object({ targetUserId: z.string().min(1) })
    const body = Body.parse((req as any).body ?? {})
    await deps.db.pool.query(
      `update public.space_rooms
          set room_admin_user_ids = array_remove(room_admin_user_ids, $1::uuid),
              updated_at = now()
        where slug=$2`,
      [body.targetUserId, slug],
    )
    return { ok: true }
  })

  // Conversation membership helpers for UI (no legacy DB facade)
  app.get('/api/v1/me/conversations/:conversationId/membership', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
    const r = await deps.db.pool.query(
      `select role, last_read_at from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`,
      [cid, a.userId],
    )
    return { row: r.rows[0] ?? null }
  })

  app.get('/api/v1/conversations/:conversationId/public-info', async (req) => {
    await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
    const r = await deps.db.pool.query(
      `select id, kind, group_is_public, channel_is_public, public_nick from public.chat_conversations where id=$1 limit 1`,
      [cid],
    )
    return { row: r.rows[0] ?? null }
  })

  // --- Public user peek (replace get_user_profile_for_peek RPC) ---
  app.get('/api/v1/users/:targetUserId/peek-profile', async (req) => {
    const a = await deps.requireAuth(req)
    const targetUserId = String((req.params as any).targetUserId ?? '').trim()
    if (!targetUserId) throw Object.assign(new Error('bad_target_user'), { statusCode: 400 })

    const r = await deps.db.pool.query(
      `
      select
        id,
        display_name,
        avatar_url,
        profile_slug,
        last_active_at,
        last_login_at,
        profile_show_last_active,
        profile_show_online
      from public.users
      where id = $1
        and status <> 'deleted'
      limit 1
      `,
      [targetUserId],
    )
    const u = r.rows[0] as any
    if (!u?.id) return { ok: false, error: 'not_found' }

    const rawActivity = u.last_active_at ?? u.last_login_at ?? null
    const lastActivityVisible = u.profile_show_last_active !== false
    const isOnline =
      u.profile_show_online === true &&
      u.last_active_at != null &&
      new Date(u.last_active_at).getTime() >= Date.now() - 2 * 60_000

    return {
      ok: true,
      id: u.id,
      display_name: u.display_name,
      avatar_url: u.avatar_url ?? null,
      profile_slug: u.profile_slug ?? null,
      last_activity_at: rawActivity,
      last_login_at: u.last_login_at ?? null,
      last_activity_visible: lastActivityVisible,
      is_online: isOnline,
      restricted: false,
      viewer_id: a.userId,
    }
  })

  // --- Direct conversation lifecycle (no legacy RPC) ---
  app.post('/api/v1/me/conversations/:conversationId/leave-direct', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
    emptyObject.parse((req as any).body ?? {})

    const c = await deps.db.pool.query<{ kind: string }>(`select kind from public.chat_conversations where id=$1 limit 1`, [cid])
    if (c.rows[0]?.kind !== 'direct') return { ok: false, error: 'not_direct' }

    const del = await deps.db.pool.query(`delete from public.chat_conversation_members where conversation_id=$1 and user_id=$2`, [cid, a.userId])
    if (!del.rowCount) return { ok: false, error: 'not_member' }
    return { ok: true }
  })

  app.post('/api/v1/me/conversations/:conversationId/delete-direct-for-all', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
    emptyObject.parse((req as any).body ?? {})

    const c = await deps.db.pool.query<{ kind: string }>(`select kind from public.chat_conversations where id=$1 limit 1`, [cid])
    if (c.rows[0]?.kind !== 'direct') return { ok: false, error: 'not_direct' }

    const am = await deps.db.pool.query(`select 1 from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`, [cid, a.userId])
    if (!am.rowCount) return { ok: false, error: 'not_member' }

    await deps.db.pool.query(`delete from public.chat_messages where conversation_id=$1`, [cid])
    await deps.db.pool.query(`delete from public.chat_conversation_members where conversation_id=$1`, [cid])
    await deps.db.pool.query(`delete from public.chat_conversations where id=$1`, [cid])
    return { ok: true }
  })

  app.post('/api/v1/me/conversations/:conversationId/delete-owned', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
    emptyObject.parse((req as any).body ?? {})

    const c = await deps.db.pool.query<{ kind: string }>(`select kind from public.chat_conversations where id=$1 limit 1`, [cid])
    const kind = c.rows[0]?.kind
    if (kind !== 'group' && kind !== 'channel') return { ok: false, error: 'not_group_or_channel' }

    const role = await deps.db.pool.query<{ role: string }>(
      `select role from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`,
      [cid, a.userId],
    )
    if (!role.rowCount) return { ok: false, error: 'not_member' }
    const r = String(role.rows[0]?.role ?? 'member')
    if (r !== 'owner') return { ok: false, error: 'not_owner' }

    await deps.db.pool.query(`delete from public.chat_messages where conversation_id=$1`, [cid])
    await deps.db.pool.query(`delete from public.chat_conversation_members where conversation_id=$1`, [cid])
    await deps.db.pool.query(`delete from public.chat_conversations where id=$1`, [cid])
    return { ok: true }
  })

  // --- Admin: registered users (no legacy RPC) ---
  app.get('/api/v1/admin/users', async (req) => {
    await requireStaff(req)
    const Q = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(200),
      offset: z.coerce.number().int().min(0).max(10_000).default(0),
    })
    const q = Q.parse((req as any).query ?? {})
    const r = await deps.db.pool.query(
      `
      select
        u.id,
        u.email,
        u.display_name,
        u.status,
        u.created_at,
        coalesce(array_agg(r.code order by r.code) filter (where r.code is not null), '{}'::text[]) as global_roles
      from public.users u
      left join public.user_global_roles ugr on ugr.user_id = u.id
      left join public.roles r on r.id = ugr.role_id and r.scope_type = 'global'
      group by u.id
      order by u.created_at desc nulls last, u.id desc
      limit $1
      offset $2
      `,
      [q.limit, q.offset],
    )
    return { rows: r.rows }
  })

  app.post('/api/v1/admin/users/:targetUserId/global-role', async (req) => {
    const viewer = await requireStaff(req)
    const targetUserId = String((req.params as any).targetUserId ?? '').trim()
    const Body = z.object({ code: z.string().min(1), grant: z.boolean() })
    const body = Body.parse((req as any).body ?? {})

    const code = body.code.trim()
    if (code === 'superadmin' && !viewer.superadmin) return { ok: false, error: 'only_superadmin' }

    const role = await deps.db.pool.query<{ id: string }>(`select id from public.roles where code=$1 and scope_type='global' limit 1`, [code])
    const roleId = role.rows[0]?.id
    if (!roleId) return { ok: false, error: 'unknown_role' }

    if (body.grant) {
      await deps.db.pool.query(
        `insert into public.user_global_roles (user_id, role_id, created_at) values ($1,$2, now()) on conflict do nothing`,
        [targetUserId, roleId],
      )
    } else {
      await deps.db.pool.query(`delete from public.user_global_roles where user_id=$1 and role_id=$2`, [targetUserId, roleId])
    }
    return { ok: true }
  })

  app.delete('/api/v1/admin/users/:targetUserId', async (req) => {
    const viewer = await requireStaff(req)
    const targetUserId = String((req.params as any).targetUserId ?? '').trim()
    if (!targetUserId) throw Object.assign(new Error('bad_target_user'), { statusCode: 400 })
    if (targetUserId === viewer.userId) return { ok: false, error: 'cannot_delete_self' }

    const tr = await deps.db.pool.query<{ code: string }>(
      `select r.code
         from public.user_global_roles ugr
         join public.roles r on r.id = ugr.role_id
        where ugr.user_id=$1 and r.scope_type='global'`,
      [targetUserId],
    )
    const targetCodes = new Set(tr.rows.map((x) => x.code))
    const targetIsStaff = targetCodes.has('superadmin') || targetCodes.has('platform_admin') || targetCodes.has('support_admin')
    if (targetIsStaff && !viewer.superadmin) return { ok: false, error: 'cannot_delete_staff' }
    if (targetCodes.has('superadmin') && !viewer.superadmin) return { ok: false, error: 'cannot_delete_staff' }

    await deps.db.pool.query(`delete from public.users where id = $1`, [targetUserId])
    return { ok: true }
  })

  // --- Host dashboard helpers (no legacy RPC) ---
  app.get('/api/v1/rooms/:slug/dashboard-stats', async (req) => {
    const a = await deps.requireAuth(req)
    const slug = String((req.params as any).slug ?? '').trim()
    if (!slug) throw Object.assign(new Error('bad_slug'), { statusCode: 400 })

    const room = await deps.db.pool.query(
      `select slug, host_user_id, status, display_name, cumulative_open_seconds, open_session_started_at
         from public.space_rooms where slug=$1 limit 1`,
      [slug],
    )
    const row = room.rows[0] as any
    if (!row) return { ok: false, error: 'not_found' }

    // allow host or staff
    const staff = await requireStaff(req).then(() => true).catch(() => false)
    if (!staff && String(row.host_user_id) !== a.userId) return { ok: false, error: 'forbidden' }

    const convo = await deps.db.pool.query(
      `select id, created_at, closed_at, last_message_at, title, message_count
         from public.chat_conversations
        where kind='room' and space_room_slug=$1
        order by created_at desc nulls last, id desc
        limit 1`,
      [slug],
    )
    const c = convo.rows[0] as any
    const conversationId = c?.id ?? null
    const registeredMemberCount = conversationId
      ? (
          await deps.db.pool.query(
            `select count(*)::int as n from public.chat_conversation_members where conversation_id=$1`,
            [conversationId],
          )
        ).rows[0]?.n ?? 0
      : 0

    return {
      ok: true,
      slug,
      displayName: row.display_name ?? null,
      roomStatus: row.status ?? '',
      cumulativeOpenSeconds: Number(row.cumulative_open_seconds ?? 0) || 0,
      openSessionStartedAt: row.open_session_started_at ?? null,
      conversationId,
      messageCount: c ? Number(c.message_count ?? 0) || 0 : 0,
      chatCreatedAt: c?.created_at ?? null,
      chatClosedAt: c?.closed_at ?? null,
      chatTitle: c?.title ?? null,
      registeredMemberCount: Number(registeredMemberCount ?? 0) || 0,
    }
  })

  app.get('/api/v1/room-chats/:conversationId/guest-senders-dashboard', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })

    // allow any member of this conversation
    const am = await deps.db.pool.query(`select 1 from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`, [cid, a.userId])
    if (!am.rowCount) throw Object.assign(new Error('forbidden'), { statusCode: 403 })

    const r = await deps.db.pool.query(
      `
      select
        coalesce(sender_peer_id,'') as sender_peer_id,
        max(sender_name_snapshot) as sender_name_snapshot,
        count(*)::int as message_count
      from public.chat_messages
      where conversation_id = $1
        and sender_user_id is null
        and coalesce(sender_peer_id,'') <> ''
      group by coalesce(sender_peer_id,'')
      order by message_count desc, sender_peer_id asc
      limit 200
      `,
      [cid],
    )
    const distinct = await deps.db.pool.query(
      `select count(distinct coalesce(sender_peer_id,''))::int as n from public.chat_messages where conversation_id=$1 and sender_user_id is null and coalesce(sender_peer_id,'')<>''`,
      [cid],
    )
    const guests = r.rows.map((x: any) => ({
      senderPeerId: x.sender_peer_id,
      senderNameSnapshot: x.sender_name_snapshot ?? 'Гость',
      messageCount: Number(x.message_count ?? 0) || 0,
    }))
    return { ok: true, guests, guestDistinctCount: distinct.rows[0]?.n ?? 0 }
  })

  app.get('/api/v1/room-chats/:conversationId/registered-members-dashboard', async (req) => {
    const a = await deps.requireAuth(req)
    const cid = String((req.params as any).conversationId ?? '').trim()
    if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })

    const am = await deps.db.pool.query(`select 1 from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`, [cid, a.userId])
    if (!am.rowCount) throw Object.assign(new Error('forbidden'), { statusCode: 403 })

    const r = await deps.db.pool.query(
      `
      select u.id as user_id, u.display_name, u.avatar_url
      from public.chat_conversation_members m
      join public.users u on u.id = m.user_id
      where m.conversation_id = $1
      order by u.display_name asc nulls last, u.id asc
      `,
      [cid],
    )
    const members = r.rows.map((x: any) => ({
      userId: x.user_id,
      displayName: x.display_name ?? 'Участник',
      avatarUrl: x.avatar_url ?? null,
    }))
    return { ok: true, members }
  })

  app.post('/api/v1/admin/room-chats/purge-stale', async (req) => {
    await requireStaff(req)
    emptyObject.parse((req as any).body ?? {})

    const r = await deps.db.pool.query<{ id: string }>(
      `
      with targets as (
        select c.id
          from public.chat_conversations c
          left join public.chat_conversation_members m on m.conversation_id = c.id
         where c.kind = 'room'
         group by c.id
         having
           -- no members
           count(m.user_id) = 0
           or
           -- no messages
           not exists (select 1 from public.chat_messages mm where mm.conversation_id = c.id)
      ),
      gone_members as (
        delete from public.chat_conversation_members m
         using targets t
         where m.conversation_id = t.id
        returning m.conversation_id
      ),
      gone_messages as (
        delete from public.chat_messages mm
         using targets t
         where mm.conversation_id = t.id
        returning mm.conversation_id
      ),
      gone_conversations as (
        delete from public.chat_conversations c
         using targets t
         where c.id = t.id
        returning c.id
      )
      select id from gone_conversations
      `,
    )

    return { ok: true, deleted: r.rowCount }
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

  // --- Web Push: test delivery (self) ---
  const pushTestBody = z
    .object({
      title: z.string().min(1).optional(),
      body: z.string().min(1).optional(),
      url: z.string().min(1).optional(),
    })
    .optional()

  app.post('/api/v1/me/push-test', async (req) => {
    const a = await deps.requireAuth(req)
    const body = pushTestBody.parse((req as any).body ?? undefined) ?? {}
    const status = getWebPushConfigStatus()
    void sendWebPushToUser(
      deps.db.pool,
      a.userId,
      {
        type: 'test',
        title: body.title ?? 'redflow.online',
        body: body.body ?? 'Test push',
        url: body.url ?? '/dashboard/messenger',
        tag: 'test',
      },
      undefined,
    )
    return { ok: true, configured: status.configured }
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
