import type { Pool } from 'pg'

export type MeProfileRow = {
  id: string
  display_name: string
  profile_slug: string | null
  email: string | null
  avatar_url: string | null
  status: string
  room_ui_preferences: unknown | null
  messenger_pinned_conversation_ids: unknown | null
  profile_search_closed: boolean
  profile_search_allow_by_name: boolean
  profile_search_allow_by_email: boolean
  profile_search_allow_by_slug: boolean
  dm_allow_from: string
  profile_view_allow_from: string
  profile_show_avatar: boolean
  profile_show_slug: boolean
  profile_show_last_active: boolean
  profile_show_online: boolean
  profile_dm_receipts_private: boolean
}

export async function getMeProfile(pool: Pool, userId: string): Promise<MeProfileRow> {
  const r = await pool.query<MeProfileRow>(
    `
    select
      id,
      display_name,
      profile_slug,
      email,
      avatar_url,
      status,
      room_ui_preferences,
      messenger_pinned_conversation_ids,
      profile_search_closed,
      profile_search_allow_by_name,
      profile_search_allow_by_email,
      profile_search_allow_by_slug,
      dm_allow_from,
      profile_view_allow_from,
      profile_show_avatar,
      profile_show_slug,
      profile_show_last_active,
      profile_show_online,
      profile_dm_receipts_private
    from public.users
    where id = $1
    limit 1
    `,
    [userId],
  )
  const row = r.rows[0]
  if (!row) throw Object.assign(new Error('not_found'), { statusCode: 404 })
  return row
}

export async function listMyGlobalRoles(pool: Pool, userId: string): Promise<unknown[]> {
  const r = await pool.query(
    `
    select r.code, r.title, r.scope_type
      from public.user_global_roles ugr
      join public.roles r on r.id = ugr.role_id
     where ugr.user_id = $1 and r.scope_type = 'global'
     order by r.code asc
    `,
    [userId],
  )
  return r.rows
}

export async function getMyActivePlan(pool: Pool, userId: string): Promise<{ title: string; status: string; trial_ends_at: string | null } | null> {
  const r = await pool.query<{ status: string; trial_ends_at: string | null; title: string }>(
    `
    select s.status, s.trial_ends_at, p.title
      from public.account_subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
     where s.status = 'active'
       and s.account_id in (select account_id from public.account_members where user_id = $1)
     order by s.updated_at desc nulls last, s.created_at desc
     limit 1
    `,
    [userId],
  )
  const row = r.rows[0]
  if (!row?.title) return null
  return { title: row.title, status: row.status, trial_ends_at: row.trial_ends_at ?? null }
}

function sanitizeMeUsersPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    'display_name',
    'avatar_url',
    'profile_slug',
    'messenger_pinned_conversation_ids',
    'room_ui_preferences',
    'profile_search_closed',
    'profile_search_allow_by_name',
    'profile_search_allow_by_email',
    'profile_search_allow_by_slug',
    'dm_allow_from',
    'profile_view_allow_from',
    'profile_show_avatar',
    'profile_show_slug',
    'profile_show_last_active',
    'profile_show_online',
    'profile_dm_receipts_private',
    'updated_at',
  ])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) throw Object.assign(new Error('forbidden_patch'), { statusCode: 403 })
    out[k] = v
  }
  if (!Object.keys(out).length) throw Object.assign(new Error('empty_patch'), { statusCode: 400 })
  return out
}

export async function patchMeProfile(pool: Pool, args: { userId: string; patch: Record<string, unknown> }): Promise<void> {
  const clean = sanitizeMeUsersPatch(args.patch)
  const cols = Object.keys(clean)
  const vals = cols.map((c) => (clean as any)[c])
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
  await pool.query(`update public.users set ${sets} where id = $${cols.length + 1}`, [...vals, args.userId])
}

