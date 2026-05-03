import { supabase } from './supabase'
import { normalizeSupabaseStoragePublicUrl } from './supabaseStorageUrl'

/** PostgREST отдаёт timestamptz в JSON как строку; на всякий случай принимаем и число ms. */
function parseRpcTimestamp(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const s = v.trim()
    return s ? s : null
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString()
  return null
}

export type PublicUserProfileRow = {
  id: string
  displayName: string
  avatarUrl: string | null
  profileSlug: string | null
  /** Сведённая «последняя активность» (heartbeat и/или вход). */
  lastActivityAt: string | null
  /** Можно ли показывать строку «Был(а): …» (если false — время скрыто настройкой приватности). */
  lastActivityVisible: boolean
  /** Статус «в сети» с учётом приватности `profile_show_online`. */
  isOnline: boolean
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

  const rawActivity =
    parseRpcTimestamp(row.last_activity_at) ??
    parseRpcTimestamp(row.last_login_at) ??
    null

  const lastActivityVisible = row.last_activity_visible !== false

  return {
    data: {
      id: String(row.id ?? ''),
      displayName:
        typeof row.display_name === 'string' && row.display_name.trim()
          ? row.display_name.trim()
          : 'Пользователь',
      avatarUrl:
        typeof row.avatar_url === 'string' && row.avatar_url.trim()
          ? normalizeSupabaseStoragePublicUrl(row.avatar_url.trim())
          : null,
      profileSlug:
        typeof row.profile_slug === 'string' && row.profile_slug.trim() ? row.profile_slug.trim() : null,
      lastActivityAt: rawActivity,
      lastActivityVisible,
      isOnline: row.is_online === true,
      restricted: row.restricted === true,
    },
    error: null,
  }
}
