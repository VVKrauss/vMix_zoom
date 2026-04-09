const SUFFIX = '::studio'

/** Псевдо-id плитки эфира студии (как `::screen` для демонстрации). */
export function studioProgramTileKey(peerId: string): string {
  return `${peerId}${SUFFIX}`
}

export function isStudioProgramTileId(tileId: string): boolean {
  return tileId.endsWith(SUFFIX)
}

export function parseStudioProgramTilePeerId(tileId: string): string | null {
  if (!isStudioProgramTileId(tileId)) return null
  return tileId.slice(0, -SUFFIX.length)
}
