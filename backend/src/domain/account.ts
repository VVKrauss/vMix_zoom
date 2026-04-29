import type { Pool } from 'pg'

export async function deleteMyAccount(pool: Pool, userId: string): Promise<unknown> {
  // Best-effort cleanup for portable DB (no auth.users).
  try {
    await pool.query(`delete from public.refresh_sessions where user_id = $1`, [userId])
  } catch {
    /* ignore */
  }
  await pool.query(`delete from public.push_subscriptions where user_id = $1`, [userId]).catch(() => {})
  await pool.query(`delete from public.user_presence_public where user_id = $1`, [userId]).catch(() => {})
  await pool.query(`delete from public.chat_conversation_join_requests where user_id = $1`, [userId]).catch(() => {})
  await pool.query(`delete from public.chat_conversation_members where user_id = $1`, [userId]).catch(() => {})
  await pool.query(`delete from public.user_contacts where user_id = $1 or contact_user_id = $1`, [userId]).catch(() => {})

  const r = await pool.query(`delete from public.users where id = $1`, [userId])
  if (!r.rowCount) return { ok: false, error: 'user_not_found' }
  return { ok: true }
}

