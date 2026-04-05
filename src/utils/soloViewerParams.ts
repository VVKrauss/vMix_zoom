function searchParams(search: string) {
  const s = search.startsWith('?') ? search.slice(1) : search.replace(/^\?/, '')
  return new URLSearchParams(s)
}

/** `?room=…` из адресной строки (экран входа и общая ссылка на комнату). */
export function getRoomFromSearch(search: string = typeof window !== 'undefined' ? window.location.search : ''): string | null {
  const room = searchParams(search).get('room')?.trim()
  return room || null
}

/** Параметры `?room=…&peer=…` для страницы «только сигнал выбранного участника». */
export function parseSoloViewerParams(search: string = typeof window !== 'undefined' ? window.location.search : ''): {
  room: string
  peer: string
} | null {
  const q = searchParams(search.startsWith('?') ? search : `?${search}`)
  const room = q.get('room')?.trim()
  const peer = q.get('peer')?.trim()
  if (!room || !peer) return null
  return { room, peer }
}

/** Полный URL страницы «только этот участник»: `origin/path?room=…&peer=…`. */
export function buildSoloViewerAbsoluteUrl(roomId: string, peerId: string): string {
  const u = new URL(window.location.href)
  u.search = ''
  u.searchParams.set('room', roomId.trim())
  u.searchParams.set('peer', peerId.trim())
  return u.toString()
}

/** Записать в URL только `room`, не трогая остальные query-ключи (кроме `peer` при необходимости). */
export function replaceRoomInBrowserUrl(roomId: string, options?: { removePeer?: boolean }) {
  const url = new URL(window.location.href)
  if (roomId.trim()) {
    url.searchParams.set('room', roomId.trim())
  } else {
    url.searchParams.delete('room')
  }
  if (options?.removePeer) url.searchParams.delete('peer')
  const qs = url.searchParams.toString()
  window.history.replaceState({}, '', `${url.pathname}${qs ? `?${qs}` : ''}`)
}
