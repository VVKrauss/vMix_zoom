/** Порт из `srt://host:port?…` (в т.ч. после `]:` для IPv6). */
export function parseSrtListenPort(url: string): number | null {
  const u = url.trim()
  if (!u.toLowerCase().startsWith('srt://')) return null
  const base = u.split('?')[0]
  const colon = base.lastIndexOf(':')
  if (colon <= 'srt://'.length) return null
  const p = base.slice(colon + 1)
  const n = parseInt(p, 10)
  if (!Number.isFinite(n) || n < 1 || n > 65535) return null
  return n
}
