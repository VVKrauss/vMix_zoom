/** Разбор ссылок YouTube на клиенте — без Edge Function (не «зависает» на invoke). */

const ID_RE = /^[a-zA-Z0-9_-]{6,}$/

export function extractYoutubeVideoId(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()

    if (host === 'youtu.be') {
      const seg = u.pathname.replace(/^\//, '').split('/').filter(Boolean)[0]
      return seg && ID_RE.test(seg) ? seg : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const path = u.pathname || '/'
      if (path === '/watch' || path.startsWith('/watch/')) {
        const v = u.searchParams.get('v')?.trim()
        return v && ID_RE.test(v) ? v : null
      }
      for (const prefix of ['/embed/', '/shorts/', '/live/']) {
        if (path.startsWith(prefix)) {
          const seg = path.slice(prefix.length).split('/').filter(Boolean)[0]
          return seg && ID_RE.test(seg) ? seg : null
        }
      }
    }
  } catch {
    return null
  }
  return null
}

export function youtubeEmbedIframeSrc(videoId: string): string {
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`
}

export function youtubeThumbnailUrl(videoId: string, quality: 'hqdefault' | 'mqdefault' | 'maxresdefault' = 'hqdefault'): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${quality}.jpg`
}

/** Публичный oEmbed — запрос из браузера, с таймаутом (не Edge Function). */
export async function fetchYoutubeOembedMeta(pageUrl: string): Promise<{
  title?: string
  author_name?: string
}> {
  const ac = new AbortController()
  const t = window.setTimeout(() => ac.abort(), 4500)
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(pageUrl)}`,
      {
        signal: ac.signal,
        mode: 'cors',
        headers: { accept: 'application/json' },
      },
    )
    if (!r.ok) return {}
    const j = (await r.json()) as { title?: string; author_name?: string }
    return {
      ...(typeof j.title === 'string' && j.title.trim() ? { title: j.title.trim() } : {}),
      ...(typeof j.author_name === 'string' && j.author_name.trim() ? { author_name: j.author_name.trim() } : {}),
    }
  } catch {
    return {}
  } finally {
    window.clearTimeout(t)
  }
}
