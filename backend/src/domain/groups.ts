import type { Pool } from 'pg'
import { assertConversationMember } from './conversationAuthz.js'

async function assertGroup(pool: Pool, conversationId: string): Promise<void> {
  const r = await pool.query<{ kind: string; closed_at: string | null }>(
    `select kind, closed_at from public.chat_conversations where id=$1 limit 1`,
    [conversationId],
  )
  if (r.rows[0]?.kind !== 'group') throw Object.assign(new Error('not_group'), { statusCode: 400 })
  if (r.rows[0]?.closed_at) throw Object.assign(new Error('closed'), { statusCode: 403 })
}

async function isGroupAdmin(pool: Pool, conversationId: string, userId: string): Promise<boolean> {
  const r = await pool.query<{ role: string }>(
    `select role from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`,
    [conversationId, userId],
  )
  const role = r.rows[0]?.role ?? 'member'
  return role === 'owner' || role === 'admin' || role === 'moderator'
}

export async function createGroupChat(pool: Pool, args: { userId: string; title: string; isPublic: boolean }): Promise<string> {
  const title = String(args.title ?? '').trim().slice(0, 200) || 'Группа'
  const r = await pool.query<{ id: string }>(
    `insert into public.chat_conversations (id, kind, title, created_by, created_at, group_is_public)
     values (gen_random_uuid(), 'group', $2, $1, now(), $3)
     returning id`,
    [args.userId, title, args.isPublic],
  )
  const id = r.rows[0]?.id
  if (!id) throw new Error('create_failed')
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
     values ($1,$2,'owner', now()) on conflict do nothing`,
    [id, args.userId],
  )
  return id
}

export async function joinPublicGroupChat(pool: Pool, args: { userId: string; conversationId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  const r = await pool.query<{ group_is_public: boolean; kind: string; closed_at: string | null }>(
    `select kind, closed_at, group_is_public from public.chat_conversations where id=$1 limit 1`,
    [cid],
  )
  const row = r.rows[0]
  if (!row || row.kind !== 'group' || row.closed_at) return { ok: false, error: 'not_found' }
  if (row.group_is_public !== true) return { ok: false, error: 'not_public' }
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
     values ($1,$2,'member', now()) on conflict do nothing`,
    [cid, args.userId],
  )
  return { ok: true }
}

export async function leaveGroupChat(pool: Pool, args: { userId: string; conversationId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await pool.query(`delete from public.chat_conversation_members where conversation_id=$1 and user_id=$2`, [cid, args.userId])
  return { ok: true }
}

export async function addUsersToGroupChat(pool: Pool, args: { userId: string; conversationId: string; userIds: string[] }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertConversationMember(pool, cid, args.userId)
  await assertGroup(pool, cid)
  if (!(await isGroupAdmin(pool, cid, args.userId))) return { ok: false, error: 'forbidden', added: 0 }
  const ids = [...new Set(args.userIds.map((x) => x.trim()).filter(Boolean))].slice(0, 200)
  let added = 0
  for (const uid of ids) {
    const r = await pool.query(
      `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
       values ($1,$2,'member', now()) on conflict do nothing`,
      [cid, uid],
    )
    added += r.rowCount ? 1 : 0
  }
  return { ok: true, added }
}

export async function updateGroupProfile(
  pool: Pool,
  args: {
    userId: string
    conversationId: string
    title?: string | null
    publicNick?: string | null
    isPublic?: boolean | null
    avatarPath?: string | null
    avatarThumbPath?: string | null
  },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertConversationMember(pool, cid, args.userId)
  await assertGroup(pool, cid)
  if (!(await isGroupAdmin(pool, cid, args.userId))) return { ok: false, error: 'forbidden' }

  const patch: Record<string, unknown> = {}
  if (args.title !== undefined) patch.title = args.title
  if (args.publicNick !== undefined) patch.public_nick = args.publicNick
  if (args.isPublic !== undefined && args.isPublic !== null) patch.group_is_public = args.isPublic
  if (args.avatarPath !== undefined) patch.avatar_path = args.avatarPath
  if (args.avatarThumbPath !== undefined) patch.avatar_thumb_path = args.avatarThumbPath
  if (!Object.keys(patch).length) return { ok: true }

  const cols = Object.keys(patch)
  const vals = cols.map((c) => (patch as any)[c])
  const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(', ')
  await pool.query(`update public.chat_conversations set ${sets} where id=$1`, [cid, ...vals])
  return { ok: true }
}

