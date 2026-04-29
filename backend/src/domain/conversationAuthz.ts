import type { Pool } from 'pg'

export async function assertConversationMember(pool: Pool, conversationId: string, userId: string): Promise<void> {
  const cid = conversationId.trim()
  if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
  const r = await pool.query(
    `select 1 from public.chat_conversation_members where conversation_id = $1 and user_id = $2 limit 1`,
    [cid, userId],
  )
  if (!r.rowCount) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
}

