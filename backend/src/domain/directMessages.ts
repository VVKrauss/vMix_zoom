import type { Pool } from 'pg'
import { assertConversationMember } from './conversationAuthz.js'

export type DirectMessagesPageArgs = {
  conversationId: string
  userId: string
  limit: number
  before?: { createdAt: string; id: string } | null
}

export async function listDirectMessagesPage(pool: Pool, args: DirectMessagesPageArgs): Promise<{ rows: unknown[] }> {
  const limit = Math.max(1, Math.min(100, Math.floor(args.limit)))
  const cid = args.conversationId.trim()
  await assertConversationMember(pool, cid, args.userId)

  const values: unknown[] = [cid]
  let where = `where conversation_id = $1`

  if (args.before?.createdAt && args.before?.id) {
    values.push(args.before.createdAt)
    values.push(args.before.id.trim())
    // older than cursor, stable ordering by (created_at desc, id desc)
    where += ` and (created_at < $2 or (created_at = $2 and id < $3))`
  }

  values.push(limit)
  const limitParam = `$${values.length}`

  const r = await pool.query(
    `
      select
        id,
        sender_user_id,
        sender_name_snapshot,
        kind,
        body,
        meta,
        created_at,
        edited_at,
        reply_to_message_id,
        quote_to_message_id
      from public.chat_messages
      ${where}
      order by created_at desc, id desc
      limit ${limitParam}
    `,
    values,
  )

  return { rows: r.rows }
}

