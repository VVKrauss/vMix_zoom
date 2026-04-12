import { supabase } from './supabase'

export type PublicUserProfileRow = {
  id: string
  displayName: string
  avatarUrl: string | null
  profileSlug: string | null
  lastLoginAt: string | null
}

export async function fetchPublicUserProfile(
  userId: string,
): Promise<{ data: PublicUserProfileRow | null; error: string | null }> {
  const id = userId.trim()
  if (!id) return { data: null, error: 'Не указан пользователь' }

  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, avatar_url, profile_slug, last_login_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data || typeof data !== 'object') return { data: null, error: null }

  const row = data as Record<string, unknown>
  return {
    data: {
      id: String(row.id ?? ''),
      displayName:
        typeof row.display_name === 'string' && row.display_name.trim()
          ? row.display_name.trim()
          : 'Пользователь',
      avatarUrl:
        typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null,
      profileSlug:
        typeof row.profile_slug === 'string' && row.profile_slug.trim() ? row.profile_slug.trim() : null,
      lastLoginAt:
        typeof row.last_login_at === 'string' && row.last_login_at.trim() ? row.last_login_at.trim() : null,
    },
    error: null,
  }
}
