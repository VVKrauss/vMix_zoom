import type { Pool } from 'pg'

export async function listUserPresencePublicByIds(
  pool: Pool,
  _viewerId: string,
  userIds: readonly string[],
): Promise<unknown[]> {
  const ids = [...new Set(userIds.map((x) => x.trim()).filter(Boolean))].slice(0, 200)
  if (!ids.length) return []
  const r = await pool.query(
    `select user_id, last_active_at, presence_last_background_at, profile_show_online
       from public.user_presence_public
      where user_id = any($1::uuid[])`,
    [ids],
  )
  return r.rows
}

