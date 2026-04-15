export function extractYoutubeVideoId(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]
      return id && /^[\w-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'www.youtube.com') {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v')
        if (v && /^[\w-]{11}$/.test(v)) return v
      }
      const m = u.pathname.match(/^\/embed\/([\w-]{11})/)
      if (m) return m[1] ?? null
      const m2 = u.pathname.match(/^\/shorts\/([\w-]{11})/)
      if (m2) return m2[1] ?? null
    }
  } catch {
    return null
  }
  return null
}

/** Порядок: максимальное качество → запасные (maxres есть не у всех роликов). */
const YOUTUBE_THUMB_SIZES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'] as const

export function youtubeThumbnailFallbackChain(id: string): string[] {
  const clean = id.trim()
  return YOUTUBE_THUMB_SIZES.map((s) => `https://i.ytimg.com/vi/${clean}/${s}.jpg`)
}

/** URL превью maxres (для черновика); в UI при ошибке загрузки переключайтесь по цепочке {@link youtubeThumbnailFallbackChain}. */
export function youtubeThumbnailFromId(id: string): string {
  return youtubeThumbnailFallbackChain(id)[0] ?? `https://i.ytimg.com/vi/${id.trim()}/maxresdefault.jpg`
}

function thumbnailFromYoutubeOEmbed(j: Record<string, unknown>, pageUrl: string): string | undefined {
  const id = extractYoutubeVideoId(pageUrl)
  if (id) return youtubeThumbnailFromId(id)
  const raw = j.thumbnail_url
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const m = raw.match(/i\.ytimg\.com\/vi\/([^/]+)\//)
  if (m?.[1]) return youtubeThumbnailFromId(m[1])
  return raw.trim()
}

export async function fetchYoutubeOEmbed(
  pageUrl: string,
): Promise<{ title?: string; thumbnail?: string; author?: string } | null> {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(pageUrl)}&format=json`,
    )
    if (!r.ok) return null
    const j = (await r.json()) as Record<string, unknown>
    const thumbnail = thumbnailFromYoutubeOEmbed(j, pageUrl)
    return {
      ...(typeof j.title === 'string' ? { title: j.title } : {}),
      ...(thumbnail ? { thumbnail } : {}),
      ...(typeof j.author_name === 'string' ? { author: j.author_name } : {}),
    }
  } catch {
    return null
  }
}

export function isProbablyYoutubeUrl(raw: string): boolean {
  return extractYoutubeVideoId(raw) !== null
}
