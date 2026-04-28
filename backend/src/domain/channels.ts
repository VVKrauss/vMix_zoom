import type { Pool } from 'pg'
import { assertConversationMember } from './conversationAuthz.js'
import { assertUuidList } from './uuidList.js'

async function assertChannelMember(pool: Pool, conversationId: string, userId: string): Promise<void> {
  await assertConversationMember(pool, conversationId, userId)
  const r = await pool.query<{ kind: string; closed_at: string | null }>(
    `select kind, closed_at from public.chat_conversations where id = $1 limit 1`,
    [conversationId],
  )
  if (r.rows[0]?.kind !== 'channel') throw Object.assign(new Error('not_channel'), { statusCode: 400 })
  if (r.rows[0]?.closed_at) throw Object.assign(new Error('closed'), { statusCode: 403 })
}

async function isChannelAdmin(pool: Pool, conversationId: string, userId: string): Promise<boolean> {
  const r = await pool.query<{ role: string }>(
    `select role from public.chat_conversation_members where conversation_id = $1 and user_id = $2 limit 1`,
    [conversationId, userId],
  )
  const role = r.rows[0]?.role ?? 'member'
  return role === 'owner' || role === 'admin' || role === 'moderator'
}

async function readChannelModes(pool: Pool, conversationId: string): Promise<{ posting: string; comments: string }> {
  const r = await pool.query<{ channel_posting_mode: string | null; channel_comments_mode: string | null }>(
    `select channel_posting_mode, channel_comments_mode from public.chat_conversations where id = $1 limit 1`,
    [conversationId],
  )
  return {
    posting: r.rows[0]?.channel_posting_mode ?? 'admins_only',
    comments: r.rows[0]?.channel_comments_mode ?? 'everyone',
  }
}

async function refreshChannelPreviewFromLatestPost(pool: Pool, conversationId: string): Promise<void> {
  const last = await pool.query<{ created_at: string; preview: string }>(
    `
    select m.created_at, left(coalesce(m.body,''), 280) as preview
    from public.chat_messages m
    where m.conversation_id = $1
      and m.reply_to_message_id is null
      and m.kind in ('text','system','image','audio')
    order by m.created_at desc, m.id desc
    limit 1
    `,
    [conversationId],
  )
  await pool.query(
    `update public.chat_conversations set last_message_at = $2, last_message_preview = $3 where id = $1`,
    [conversationId, last.rows[0]?.created_at ?? null, last.rows[0]?.preview ?? null],
  )
}

export async function createChannel(
  pool: Pool,
  args: { userId: string; title: string; isPublic: boolean; postingMode: 'admins_only' | 'everyone'; commentsMode: 'everyone' | 'disabled' },
): Promise<string> {
  const title = String(args.title ?? '').trim().slice(0, 200) || 'Канал'
  const created = await pool.query<{ id: string }>(
    `insert into public.chat_conversations (id, kind, title, created_by, created_at, channel_is_public, channel_posting_mode, channel_comments_mode)
     values (gen_random_uuid(), 'channel', $2, $1, now(), $3, $4, $5)
     returning id`,
    [args.userId, title, args.isPublic, args.postingMode, args.commentsMode],
  )
  const cid = created.rows[0]?.id
  if (!cid) throw new Error('create_channel_failed')
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
     values ($1, $2, 'owner', now())
     on conflict do nothing`,
    [cid, args.userId],
  )
  return cid
}

export async function updateChannelProfile(
  pool: Pool,
  args: {
    userId: string
    conversationId: string
    title?: string | null
    publicNick?: string | null
    isPublic?: boolean | null
    postingMode?: 'admins_only' | 'everyone' | null
    commentsMode?: 'everyone' | 'disabled' | null
    avatarPath?: string | null
    avatarThumbPath?: string | null
  },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  if (!(await isChannelAdmin(pool, cid, args.userId))) throw Object.assign(new Error('forbidden'), { statusCode: 403 })

  const patch: Record<string, unknown> = {}
  if (args.title !== undefined) patch.title = args.title
  if (args.publicNick !== undefined) patch.public_nick = args.publicNick
  if (args.isPublic !== undefined && args.isPublic !== null) patch.channel_is_public = args.isPublic
  if (args.postingMode !== undefined && args.postingMode !== null) patch.channel_posting_mode = args.postingMode
  if (args.commentsMode !== undefined && args.commentsMode !== null) patch.channel_comments_mode = args.commentsMode
  if (args.avatarPath !== undefined) patch.avatar_path = args.avatarPath
  if (args.avatarThumbPath !== undefined) patch.avatar_thumb_path = args.avatarThumbPath
  if (!Object.keys(patch).length) return { ok: true }

  const cols = Object.keys(patch)
  const vals = cols.map((c) => (patch as any)[c])
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ')
  await pool.query(`update public.chat_conversations set ${sets} where id = $1`, [cid, ...vals])
  return { ok: true }
}

export async function joinPublicChannel(pool: Pool, args: { userId: string; conversationId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  const r = await pool.query<{ channel_is_public: boolean; kind: string; closed_at: string | null }>(
    `select kind, closed_at, channel_is_public from public.chat_conversations where id = $1 limit 1`,
    [cid],
  )
  const row = r.rows[0]
  if (!row || row.kind !== 'channel' || row.closed_at) return { ok: false, error: 'not_found' }
  if (row.channel_is_public !== true) return { ok: false, error: 'not_public' }
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
     values ($1,$2,'member', now())
     on conflict do nothing`,
    [cid, args.userId],
  )
  return { ok: true }
}

export async function leaveChannel(pool: Pool, args: { userId: string; conversationId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await pool.query(`delete from public.chat_conversation_members where conversation_id = $1 and user_id = $2`, [cid, args.userId])
  return { ok: true }
}

export async function listChannelPostsPage(pool: Pool, args: { userId: string; conversationId: string; limit: number; before?: { createdAt: string; id: string } | null }): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const limit = Math.max(1, Math.min(args.limit, 80))
  const vals: any[] = [cid]
  let where = `where conversation_id = $1 and reply_to_message_id is null and kind in ('text','system','image','audio')`
  if (args.before?.createdAt && args.before?.id) {
    vals.push(args.before.createdAt)
    vals.push(args.before.id)
    where += ` and (created_at < $2 or (created_at = $2 and id < $3))`
  }
  vals.push(limit)
  const r = await pool.query(
    `select id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at, edited_at, reply_to_message_id, quote_to_message_id
       from public.chat_messages
       ${where}
       order by created_at desc, id desc
       limit $${vals.length}`,
    vals,
  )
  return r.rows
}

export async function listChannelCommentsPage(pool: Pool, args: { userId: string; conversationId: string; postId: string; limit: number; before?: { createdAt: string; id: string } | null }): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const limit = Math.max(1, Math.min(args.limit, 120))
  const postId = args.postId.trim()
  const vals: any[] = [cid, postId]
  let where = `where conversation_id = $1 and reply_to_message_id = $2 and kind in ('text','system','image','audio')`
  if (args.before?.createdAt && args.before?.id) {
    vals.push(args.before.createdAt)
    vals.push(args.before.id)
    where += ` and (created_at < $3 or (created_at = $3 and id < $4))`
  }
  vals.push(limit)
  const r = await pool.query(
    `select id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at, edited_at, reply_to_message_id, quote_to_message_id
       from public.chat_messages
       ${where}
       order by created_at desc, id desc
       limit $${vals.length}`,
    vals,
  )
  return r.rows
}

export async function listChannelReactionsForTargets(pool: Pool, args: { userId: string; conversationId: string; targetIds: unknown }): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const ids = assertUuidList(args.targetIds, 500)
  if (!ids.length) return []
  const r = await pool.query(
    `select id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at
       from public.chat_messages
      where conversation_id = $1
        and kind = 'reaction'
        and coalesce(meta ->> 'react_to','') = any($2::text[])
      order by created_at asc, id asc`,
    [cid, ids],
  )
  return r.rows
}

export async function listChannelCommentCounts(pool: Pool, args: { userId: string; conversationId: string; postIds: unknown }): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const ids = assertUuidList(args.postIds, 500)
  if (!ids.length) return []
  const r = await pool.query(
    `select reply_to_message_id as post_id, count(*)::int as comment_count
       from public.chat_messages
      where conversation_id = $1
        and reply_to_message_id = any($2::uuid[])
        and kind in ('text','system','image','audio')
      group by reply_to_message_id`,
    [cid, ids],
  )
  return r.rows
}

export async function appendChannelPostRich(pool: Pool, args: { userId: string; conversationId: string; body: string; meta: any }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const modes = await readChannelModes(pool, cid)
  if (modes.posting === 'admins_only' && !(await isChannelAdmin(pool, cid, args.userId))) {
    throw Object.assign(new Error('forbidden'), { statusCode: 403 })
  }
  const body = String(args.body ?? '').slice(0, 4000)
  if (!body.trim()) throw Object.assign(new Error('message_body_required'), { statusCode: 400 })
  const createdAt = new Date().toISOString()
  const ins = await pool.query<{ id: string }>(
    `insert into public.chat_messages (conversation_id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at)
     values ($1,$2,'Вы','text',$3,$4,$5)
     returning id`,
    [cid, args.userId, body, args.meta ?? null, createdAt],
  )
  const messageId = ins.rows[0]?.id
  if (!messageId) throw new Error('insert_failed')
  await pool.query(
    `update public.chat_conversations set last_message_at = $2, last_message_preview = $3, message_count = coalesce(message_count,0)+1 where id = $1`,
    [cid, createdAt, body.trim().slice(0, 280)],
  )
  return { ok: true, message_id: messageId, created_at: createdAt }
}

export async function appendChannelFeedMessage(pool: Pool, args: { userId: string; conversationId: string; kind: 'text'|'image'|'audio'; body: string; meta: any }): Promise<unknown> {
  // treat as top-level post with kind mapped
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const modes = await readChannelModes(pool, cid)
  if (modes.posting === 'admins_only' && !(await isChannelAdmin(pool, cid, args.userId))) {
    throw Object.assign(new Error('forbidden'), { statusCode: 403 })
  }
  const kind = args.kind === 'image' ? 'image' : args.kind === 'audio' ? 'audio' : 'text'
  const createdAt = new Date().toISOString()
  const body = String(args.body ?? '').slice(0, 4000)
  const ins = await pool.query<{ id: string }>(
    `insert into public.chat_messages (conversation_id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at)
     values ($1,$2,'Вы',$3,$4,$5,$6)
     returning id`,
    [cid, args.userId, kind, body, args.meta ?? null, createdAt],
  )
  const messageId = ins.rows[0]?.id
  if (!messageId) throw new Error('insert_failed')
  await refreshChannelPreviewFromLatestPost(pool, cid)
  await pool.query(`update public.chat_conversations set message_count = coalesce(message_count,0)+1 where id = $1`, [cid])
  return { ok: true, message_id: messageId, created_at: createdAt }
}

export async function appendChannelComment(pool: Pool, args: { userId: string; conversationId: string; postId: string; body: string; quoteToMessageId?: string|null }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const modes = await readChannelModes(pool, cid)
  if (modes.comments === 'disabled') throw Object.assign(new Error('comments_disabled'), { statusCode: 403 })
  const postId = args.postId.trim()
  const body = String(args.body ?? '').slice(0, 4000)
  if (!body.trim()) throw Object.assign(new Error('message_body_required'), { statusCode: 400 })
  const createdAt = new Date().toISOString()
  const ins = await pool.query<{ id: string }>(
    `insert into public.chat_messages (conversation_id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at, reply_to_message_id, quote_to_message_id)
     values ($1,$2,'Вы','text',$3,$4,$5,$6,$7)
     returning id`,
    [cid, args.userId, body, null, createdAt, postId, args.quoteToMessageId?.trim() || null],
  )
  const messageId = ins.rows[0]?.id
  if (!messageId) throw new Error('insert_failed')
  // do not change sidebar preview based on comment
  await refreshChannelPreviewFromLatestPost(pool, cid)
  await pool.query(`update public.chat_conversations set message_count = coalesce(message_count,0)+1 where id = $1`, [cid])
  return { ok: true, message_id: messageId, created_at: createdAt }
}

export async function editChannelComment(pool: Pool, args: { userId: string; conversationId: string; messageId: string; newBody: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const body = String(args.newBody ?? '').slice(0, 4000)
  if (!body.trim()) throw Object.assign(new Error('message_body_required'), { statusCode: 400 })
  const r = await pool.query(
    `update public.chat_messages
        set body = $4, edited_at = now()
      where id = $1 and conversation_id = $2 and sender_user_id = $3 and reply_to_message_id is not null`,
    [args.messageId.trim(), cid, args.userId, body],
  )
  if (!r.rowCount) return { ok: false, error: 'not_edited' }
  await refreshChannelPreviewFromLatestPost(pool, cid)
  return { ok: true }
}

export async function deleteChannelComment(pool: Pool, args: { userId: string; conversationId: string; messageId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const r = await pool.query(
    `delete from public.chat_messages where id = $1 and conversation_id = $2 and sender_user_id = $3 and reply_to_message_id is not null`,
    [args.messageId.trim(), cid, args.userId],
  )
  if (!r.rowCount) return { ok: false, error: 'not_deleted' }
  await refreshChannelPreviewFromLatestPost(pool, cid)
  await pool.query(`update public.chat_conversations set message_count = greatest(0, coalesce(message_count,0) - 1) where id = $1`, [cid])
  return { ok: true }
}

export async function editChannelPostRich(pool: Pool, args: { userId: string; conversationId: string; messageId: string; newBody: string; meta: any }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const body = String(args.newBody ?? '').slice(0, 4000)
  if (!body.trim()) throw Object.assign(new Error('message_body_required'), { statusCode: 400 })
  const r = await pool.query(
    `update public.chat_messages
        set body = $4, meta = $5, edited_at = now()
      where id = $1 and conversation_id = $2 and sender_user_id = $3 and reply_to_message_id is null`,
    [args.messageId.trim(), cid, args.userId, body, args.meta ?? null],
  )
  if (!r.rowCount) return { ok: false, error: 'not_edited' }
  await refreshChannelPreviewFromLatestPost(pool, cid)
  return { ok: true }
}

export async function deleteChannelPost(pool: Pool, args: { userId: string; conversationId: string; messageId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const mid = args.messageId.trim()
  // delete post + its comments
  const del = await pool.query(
    `with gone as (
       delete from public.chat_messages
        where conversation_id = $1
          and (id = $2 or reply_to_message_id = $2)
          and sender_user_id = $3
          and (id = $2)
        returning 1
     )
     select count(*)::int as deleted from gone`,
    [cid, mid, args.userId],
  )
  const deleted = (del.rows[0] as any)?.deleted ?? 0
  await refreshChannelPreviewFromLatestPost(pool, cid)
  return { ok: true, deleted }
}

export async function toggleChannelMessageReaction(pool: Pool, args: { userId: string; conversationId: string; targetMessageId: string; emoji: string }): Promise<unknown> {
  // reuse reaction toggle logic from direct mutations but without preview changes
  const cid = args.conversationId.trim()
  await assertChannelMember(pool, cid, args.userId)
  const mid = args.targetMessageId.trim()
  const emoji = String(args.emoji ?? '').trim().slice(0, 32)
  if (!emoji) throw Object.assign(new Error('invalid_reaction_emoji'), { statusCode: 400 })
  const existing = await pool.query<{ id: string }>(
    `select id from public.chat_messages
      where conversation_id = $1 and sender_user_id = $2 and kind='reaction' and body=$3 and coalesce(meta->>'react_to','')=$4 limit 1`,
    [cid, args.userId, emoji, mid],
  )
  if (existing.rows[0]?.id) {
    await pool.query(`delete from public.chat_messages where id = $1`, [existing.rows[0].id])
    return { ok: true, action: 'removed', message_id: existing.rows[0].id, created_at: null }
  }
  const createdAt = new Date().toISOString()
  const ins = await pool.query<{ id: string }>(
    `insert into public.chat_messages (conversation_id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at)
     values ($1,$2,'Вы','reaction',$3,$4,$5)
     returning id`,
    [cid, args.userId, emoji, { react_to: mid }, createdAt],
  )
  const id = ins.rows[0]?.id
  return { ok: true, action: 'added', message_id: id, created_at: createdAt }
}

