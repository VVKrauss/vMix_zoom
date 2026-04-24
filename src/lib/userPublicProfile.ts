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
  void userId
  void parseRpcTimestamp
  return { data: null, error: 'not_migrated' }
}
