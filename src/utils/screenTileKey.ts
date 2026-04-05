const SUFFIX = '::screen'

/** Псевдо-id плитки демонстрации (локальной или удалённой). Для соло-URL по-прежнему реальный peerId. */
export function screenTileKey(peerId: string): string {
  return `${peerId}${SUFFIX}`
}

export function localScreenTileKey(localPeerId: string): string {
  return screenTileKey(localPeerId)
}

export function isScreenTileId(tileId: string): boolean {
  return tileId.endsWith(SUFFIX)
}

export function parseScreenTilePeerId(tileId: string): string | null {
  if (!isScreenTileId(tileId)) return null
  return tileId.slice(0, -SUFFIX.length)
}

export function isLocalScreenTileKey(tileId: string, localPeerId: string): boolean {
  return tileId === screenTileKey(localPeerId)
}
