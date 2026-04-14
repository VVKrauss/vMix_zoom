const PREFIX = 'vmix.dashboard.hiddenIncomingFavIds:'

function key(userId: string): string {
  return `${PREFIX}${userId.trim()}`
}

export function readHiddenIncomingFavoriteIds(userId: string): string[] {
  const uid = userId.trim()
  if (!uid) return []
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
  } catch {
    return []
  }
}

export function hideIncomingFavoriteId(userId: string, targetUserId: string): void {
  const uid = userId.trim()
  const tid = targetUserId.trim()
  if (!uid || !tid) return
  const prev = readHiddenIncomingFavoriteIds(uid)
  if (prev.includes(tid)) return
  try {
    localStorage.setItem(key(uid), JSON.stringify([...prev, tid]))
  } catch {
    /* quota */
  }
}

export function unhideIncomingFavoriteId(userId: string, targetUserId: string): void {
  const uid = userId.trim()
  const tid = targetUserId.trim()
  if (!uid || !tid) return
  const next = readHiddenIncomingFavoriteIds(uid).filter((id) => id !== tid)
  try {
    if (next.length === 0) localStorage.removeItem(key(uid))
    else localStorage.setItem(key(uid), JSON.stringify(next))
  } catch {
    /* quota */
  }
}
