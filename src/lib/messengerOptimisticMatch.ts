import type { DirectMessage } from './messenger'

/**
 * When matching an optimistic "local-…" row to a server INSERT, meta may differ
 * (e.g. link preview filled server-side) while the message is logically the same.
 * Compare only the stable user-visible parts.
 */
function metaSignatureForMatch(meta: unknown): string {
  if (!meta || typeof meta !== 'object') return 'null'
  const m = meta as {
    react_to?: unknown
    image?: { path?: unknown } | null
    images?: Array<{ path?: unknown }> | null
    audio?: { path?: unknown } | null
  }
  if (typeof m.react_to === 'string' && m.react_to.trim()) return `reaction:${m.react_to.trim()}`
  if (m.image && typeof m.image === 'object' && typeof m.image.path === 'string' && m.image.path.trim()) {
    return `image:${m.image.path.trim()}`
  }
  if (Array.isArray(m.images) && m.images.length > 0) {
    const paths = m.images.map((x) => (x && typeof x === 'object' && typeof (x as any).path === 'string' ? String((x as any).path) : '')).filter(Boolean)
    return `images:${paths.join(',')}`
  }
  if (m.audio && typeof m.audio === 'object' && typeof m.audio.path === 'string' && m.audio.path.trim()) {
    return `audio:${m.audio.path.trim()}`
  }
  // Ignore rich/link preview diffs: treat as the same for optimistic pairing.
  return 'base'
}

export function optimisticMessageMatches(
  local: DirectMessage,
  server: DirectMessage,
  opts: { senderId: string },
): boolean {
  if (local.senderUserId !== opts.senderId || server.senderUserId !== opts.senderId) return false
  if (local.kind !== server.kind) return false
  if ((local.body ?? '') !== (server.body ?? '')) return false
  if ((local.replyToMessageId ?? '') !== (server.replyToMessageId ?? '')) return false
  if (server.kind === 'reaction' || local.kind === 'reaction') {
    return (local.meta?.react_to ?? '') === (server.meta?.react_to ?? '')
  }
  return metaSignatureForMatch(local.meta) === metaSignatureForMatch(server)
}
