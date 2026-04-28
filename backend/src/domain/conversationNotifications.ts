import type { Pool } from 'pg'

export async function setConversationNotificationsMuted(
  pool: Pool,
  args: { userId: string; conversationId: string; muted: boolean },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  if (!cid) return { ok: false, error: 'conversation_required' }

  const mem = await pool.query(`select 1 from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`, [
    cid,
    args.userId,
  ])
  if (!mem.rowCount) return { ok: false, error: 'forbidden' }

  if (args.muted) {
    await pool.query(
      `insert into public.chat_conversation_notification_mutes (user_id, conversation_id, muted_at)
       values ($1,$2, now())
       on conflict (user_id, conversation_id) do update set muted_at = now()`,
      [args.userId, cid],
    )
  } else {
    await pool.query(`delete from public.chat_conversation_notification_mutes where user_id=$1 and conversation_id=$2`, [args.userId, cid])
  }
  return { ok: true, muted: args.muted }
}

