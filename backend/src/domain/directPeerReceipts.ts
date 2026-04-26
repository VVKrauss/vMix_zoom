import type { Pool } from 'pg'
import { assertConversationMember } from './conversationAuthz.js'

export async function getDirectPeerReadReceiptContext(pool: Pool, args: { userId: string; conversationId: string }): Promise<unknown> {
  const cid = args.conversationId.trim()
  await assertConversationMember(pool, cid, args.userId)

  const kind = await pool.query<{ kind: string }>(`select kind from public.chat_conversations where id = $1 limit 1`, [cid])
  if (kind.rows[0]?.kind !== 'direct') return { ok: false, error: 'not_direct' }

  const peer = await pool.query<{ user_id: string }>(
    `select user_id from public.chat_conversation_members where conversation_id = $1 and user_id <> $2 limit 1`,
    [cid, args.userId],
  )
  const peerId = peer.rows[0]?.user_id
  if (!peerId) return { ok: false, error: 'peer_not_found' }

  const lr = await pool.query<{ last_read_at: string | null }>(
    `select last_read_at from public.chat_conversation_members where conversation_id = $1 and user_id = $2 limit 1`,
    [cid, peerId],
  )
  const u = await pool.query<{ profile_dm_receipts_private: boolean | null }>(
    `select profile_dm_receipts_private from public.users where id = $1 limit 1`,
    [peerId],
  )

  return {
    ok: true,
    peer_last_read_at: lr.rows[0]?.last_read_at ?? null,
    peer_dm_receipts_private: u.rows[0]?.profile_dm_receipts_private === true,
  }
}

