/**
 * Логика «в сети» по полям зеркала user_presence_public — должна совпадать с
 * get_user_profile_for_peek (интервал 3 мин, сравнение с presence_last_background_at).
 */
// Должно быть >= частоты heartbeat у клиентов. Иначе пользователь будет «оффлайн»
// почти всё время на старых версиях фронта.
// Быстрое “гашение” при фоне обеспечивает presence_last_background_at.
// Online window for UI ring. Must be comfortably above pulse cadence + network jitter.
const ONLINE_WINDOW_MS = 20 * 1000

export type PeerPresenceMirrorInput = {
  lastActiveAt: string | null | undefined
  presenceLastBackgroundAt: string | null | undefined
  /** false = скрыть онлайн; null/undefined трактуем как true */
  profileShowOnline?: boolean | null
}

export function isPeerPresenceOnlineFromMirror(
  row: PeerPresenceMirrorInput,
  nowMs: number = Date.now(),
): boolean {
  if (row.profileShowOnline === false) return false
  const la = row.lastActiveAt
  if (la == null || typeof la !== 'string' || !la.trim()) return false
  const active = Date.parse(la)
  if (!Number.isFinite(active)) return false
  if (nowMs - active > ONLINE_WINDOW_MS) return false
  const bgRaw = row.presenceLastBackgroundAt
  if (bgRaw != null && typeof bgRaw === 'string' && bgRaw.trim()) {
    const bg = Date.parse(bgRaw)
    if (Number.isFinite(bg) && active <= bg) return false
  }
  return true
}

export function peerPresenceMirrorFromRow(row: Record<string, unknown>): PeerPresenceMirrorInput {
  const lastActiveAt =
    typeof row.last_active_at === 'string' ? row.last_active_at : row.last_active_at == null ? null : String(row.last_active_at)
  const presenceLastBackgroundAt =
    typeof row.presence_last_background_at === 'string'
      ? row.presence_last_background_at
      : row.presence_last_background_at == null
        ? null
        : String(row.presence_last_background_at)
  const rawShow = row.profile_show_online
  const profileShowOnline =
    typeof rawShow === 'boolean' ? rawShow : rawShow === null || rawShow === undefined ? undefined : Boolean(rawShow)
  return { lastActiveAt, presenceLastBackgroundAt, profileShowOnline }
}
