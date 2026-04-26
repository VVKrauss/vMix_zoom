import type { Pool } from 'pg'

export async function getAppVersion(pool: Pool): Promise<string> {
  const r = await pool.query<{ major: number; minor: number; patch: number }>(
    `select major, minor, patch from public.app_version where id = true limit 1`,
  )
  const row = r.rows[0]
  const major = row?.major ?? 0
  const minor = row?.minor ?? 0
  const patch = row?.patch ?? 0
  const mm = String(minor).padStart(2, '0')
  const ppp = String(patch).padStart(3, '0')
  return `v ${major}.${mm}.${ppp}`
}

