import type { Pool } from 'pg'

export async function listConversationMembersForMentions(
  pool: Pool,
  args: { userId: string; conversationId: string },
): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  const mem = await pool.query(`select 1 from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`, [
    cid,
    args.userId,
  ])
  if (!mem.rowCount) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
  const r = await pool.query(
    `
    select u.id as user_id, u.display_name, u.profile_slug, u.avatar_url
      from public.chat_conversation_members m
      join public.users u on u.id = m.user_id
     where m.conversation_id = $1
       and u.profile_slug is not null
     order by u.display_name asc
    `,
    [cid],
  )
  return r.rows
}

export async function markMyMentionsRead(
  pool: Pool,
  args: { userId: string; conversationId: string },
): Promise<void> {
  const cid = args.conversationId.trim()
  await pool.query(
    `update public.chat_message_mentions
        set read_at = now()
      where user_id = $1 and conversation_id = $2 and read_at is null`,
    [args.userId, cid],
  )
}

