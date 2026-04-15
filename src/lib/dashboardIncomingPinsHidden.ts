/** Локально скрытые входящие закрепы в тайле кабинета (модалка «добавили вас»). */
const PREFIX = 'vmix.dashboard.hiddenIncomingFavIds:'

function storageKey(userId: string): string {
  return `${PREFIX}${userId.trim()}`
}

export function readHiddenIncomingPinIds(userId: string): string[] {
  const uid = userId.trim()
  if (!uid) return []
  try {
    const raw = localStorage.getItem(storageKey(uid))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
  } catch {
    return []
  }
}

export function hideIncomingPinRow(userId: string, targetUserId: string): void {
  const uid = userId.trim()
  const tid = targetUserId.trim()
  if (!uid || !tid) return
  const prev = readHiddenIncomingPinIds(uid)
  if (prev.includes(tid)) return
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify([...prev, tid]))
  } catch {
    /* quota */
  }
}

export function unhideIncomingPinRow(userId: string, targetUserId: string): void {
  const uid = userId.trim()
  const tid = targetUserId.trim()
  if (!uid || !tid) return
  const next = readHiddenIncomingPinIds(uid).filter((id) => id !== tid)
  try {
    if (next.length === 0) localStorage.removeItem(storageKey(uid))
    else localStorage.setItem(storageKey(uid), JSON.stringify(next))
  } catch {
    /* quota */
  }
}
