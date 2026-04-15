import { supabase } from './supabase'

export type PublicUserProfileRow = {
  id: string
  displayName: string
  avatarUrl: string | null
  profileSlug: string | null
  lastLoginAt: string | null
  /** Профиль скрыт настройками владельца (только для чужих). */
  restricted?: boolean
}

export async function fetchPublicUserProfile(
  userId: string,
): Promise<{ data: PublicUserProfileRow | null; error: string | null }> {
  const id = userId.trim()
  if (!id) return { data: null, error: 'Не указан пользователь' }

  const { data, error } = await supabase.rpc('get_user_profile_for_peek', {
    p_target_user_id: id,
  })

  if (error) return { data: null, error: error.message }

  const row = data as Record<string, unknown> | null
  if (!row || row.error) {
    const err = typeof row?.error === 'string' ? row.error : 'load_failed'
    return { data: null, error: err === 'not_found' ? 'Пользователь не найден' : err }
  }

  if (row.ok !== true) {
    return { data: null, error: 'Некорректный ответ сервера' }
  }

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
        typeof row.last_login_at === 'string' && row.last_login_at.trim()
          ? row.last_login_at.trim()
          : null,
      restricted: row.restricted === true,
    },
    error: null,
  }
}
