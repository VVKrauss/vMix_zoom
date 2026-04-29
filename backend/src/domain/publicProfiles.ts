import type { Pool } from 'pg'

export async function getUserPublicProfileBySlug(
  pool: Pool,
  args: { viewerId: string | null; slug: string },
): Promise<unknown> {
  const slug = args.slug.trim()
  if (!slug) return { ok: false, error: 'invalid_slug' }

  const r = await pool.query(
    `
    select
      u.id,
      u.display_name,
      u.avatar_url,
      u.profile_slug,
      u.status,
      u.profile_view_allow_from,
      u.profile_show_avatar,
      u.profile_show_slug,
      u.profile_show_last_active,
      u.profile_show_online,
      p.last_active_at,
      p.presence_last_background_at,
      p.profile_show_online as mirror_profile_show_online
    from public.users u
    left join public.user_presence_public p on p.user_id = u.id
    where lower(u.profile_slug) = lower($1)
    limit 1
    `,
    [slug],
  )
  const row = r.rows[0] as any
  if (!row?.id) return { ok: false, error: 'not_found' }

  // Privacy: contacts_only hides from non-contacts.
  if (row.profile_view_allow_from === 'contacts_only' && args.viewerId && args.viewerId !== row.id) {
    const c = await pool.query(
      `select 1 from public.user_contacts where user_id = $1 and contact_user_id = $2 and deleted_at is null limit 1`,
      [row.id, args.viewerId],
    )
    if (!c.rowCount) return { ok: false, error: 'forbidden' }
  }

  return { ok: true, profile: row }
}

