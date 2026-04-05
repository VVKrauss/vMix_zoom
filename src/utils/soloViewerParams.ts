function searchParams(search: string) {
  const s = search.startsWith('?') ? search.slice(1) : search.replace(/^\?/, '')
  return new URLSearchParams(s)
}

/** Комната из пути `/r/:roomId` (React Router уже декодирует сегмент). */
export function getRoomFromPathname(pathname: string): string | null {
  const m = pathname.match(/^\/r\/([^/]+)\/?$/)
  if (!m?.[1]) return null
  const raw = m[1].trim()
  if (!raw) return null
  try {
    const decoded = decodeURIComponent(raw)
    return decoded.trim() || null
  } catch {
    return raw || null
  }
}

/** `?room=…` из адресной строки (legacy). */
export function getRoomFromSearch(search: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
  const room = searchParams(search).get('room')?.trim()
  return room || null
}

/**
 * Параметры solo viewer: комната из `/r/:id` или legacy `?room=`, участник из `?peer=`.
 */
export function parseSoloViewerParams(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '',
): { room: string; peer: string } | null {
  const q = searchParams(search.startsWith('?') ? search : `?${search}`)
  const peer = q.get('peer')?.trim()
  const roomFromPath = getRoomFromPathname(pathname)
  const roomFromQuery = q.get('room')?.trim()
  const room = roomFromPath ?? roomFromQuery
  if (!room || !peer) return null
  return { room, peer }
}

/** Полный URL страницы входа в комнату: `origin/r/:roomId` (для приглашения). */
export function buildRoomInviteAbsoluteUrl(roomId: string): string {
  const u = new URL(typeof window !== 'undefined' ? window.location.href : 'http://localhost/')
  u.pathname = `/r/${encodeURIComponent(roomId.trim())}`
  u.search = ''
  u.hash = ''
  return u.toString()
}

/** Полный URL страницы «только этот участник»: `origin/r/:roomId?peer=…`. */
export function buildSoloViewerAbsoluteUrl(roomId: string, peerId: string): string {
  const u = new URL(window.location.href)
  u.pathname = `/r/${encodeURIComponent(roomId.trim())}`
  u.search = ''
  u.searchParams.set('peer', peerId.trim())
  return u.toString()
}

/** Выставить путь `/r/:roomId`, убрать legacy `?room=`, при необходимости снять `peer`. */
export function replaceRoomInBrowserUrl(roomId: string, options?: { removePeer?: boolean }) {
  const url = new URL(window.location.href)
  const id = roomId.trim()
  url.pathname = id ? `/r/${encodeURIComponent(id)}` : '/'
  url.searchParams.delete('room')
  if (options?.removePeer) url.searchParams.delete('peer')
  const qs = url.searchParams.toString()
  window.history.replaceState({}, '', `${url.pathname}${qs ? `?${qs}` : ''}`)
}
