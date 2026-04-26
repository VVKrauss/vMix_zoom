import type { Pool } from 'pg'

export async function presenceForegroundPulse(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `
    update public.users u
       set last_active_at = now()
     where u.id = $1
       and (
         -- Keep DB writes bounded, but never get stuck "offline" after a background mark.
         u.last_active_at is null
         or u.last_active_at < now() - interval '8 seconds'
         or (
           u.presence_last_background_at is not null
           and u.last_active_at is not null
           and u.last_active_at <= u.presence_last_background_at
         )
       )
    `,
    [userId],
  )
}

export async function presenceMarkBackground(pool: Pool, userId: string): Promise<void> {
  await pool.query(`update public.users set presence_last_background_at = now() where id = $1`, [userId])
}

