import type { Pool } from 'pg'

export async function resolveConversationByInvite(pool: Pool, token: string): Promise<unknown[]> {
  const t = token.trim()
  const r = await pool.query(
    `
    select c.id, c.kind, c.title, c.public_nick, c.avatar_path, c.avatar_thumb_path,
           (select count(*)::int from public.chat_conversation_members m where m.conversation_id=c.id) as member_count,
           case when c.kind='channel' then c.channel_is_public else c.group_is_public end as is_public,
           case when c.kind='channel' then coalesce(c.channel_posting_mode,'admins_only') else null end as posting_mode,
           case when c.kind='channel' then coalesce(c.channel_comments_mode,'everyone') else null end as comments_mode
      from public.chat_conversation_invites i
      join public.chat_conversations c on c.id = i.conversation_id
     where i.token = $1 and c.closed_at is null
     limit 1
    `,
    [t],
  )
  return r.rows
}

export async function getOrCreateConversationInvite(pool: Pool, args: { userId: string; conversationId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  const can = await pool.query(
    `select 1 from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`,
    [cid, args.userId],
  )
  if (!can.rowCount) return { ok: false, error: 'forbidden' }
  const existing = await pool.query<{ token: string }>(
    `select token from public.chat_conversation_invites where conversation_id=$1 order by created_at desc limit 1`,
    [cid],
  )
  const tok = existing.rows[0]?.token
  if (tok) return { ok: true, token: tok }
  const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  await pool.query(`insert into public.chat_conversation_invites (conversation_id, token, created_at) values ($1,$2, now())`, [
    cid,
    token,
  ])
  return { ok: true, token }
}

export async function joinConversationByInvite(pool: Pool, args: { userId: string; token: string }): Promise<unknown> {
  const t = args.token.trim()
  const r = await pool.query<{ conversation_id: string; kind: string; closed_at: string | null }>(
    `
    select c.id as conversation_id, c.kind, c.closed_at
      from public.chat_conversation_invites i
      join public.chat_conversations c on c.id=i.conversation_id
     where i.token=$1
     limit 1
    `,
    [t],
  )
  const row = r.rows[0]
  if (!row?.conversation_id || row.closed_at) return { ok: false, error: 'not_found' }
  if (row.kind !== 'group' && row.kind !== 'channel') return { ok: false, error: 'not_found' }
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
     values ($1,$2,'member', now()) on conflict do nothing`,
    [row.conversation_id, args.userId],
  )
  return { ok: true, conversation_id: row.conversation_id, kind: row.kind, joined: true }
}

