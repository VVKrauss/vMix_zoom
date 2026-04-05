/** Псевдо-id плитки локальной демонстрации в раскладке «спикер» / счётчике. Не используется в URL соло — там по-прежнему реальный peerId. */
export function localScreenTileKey(localPeerId: string): string {
  return `${localPeerId}::screen`
}

export function isLocalScreenTileKey(tileId: string, localPeerId: string): boolean {
  return tileId === localScreenTileKey(localPeerId)
}
