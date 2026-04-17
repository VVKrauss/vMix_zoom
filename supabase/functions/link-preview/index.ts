// Supabase Edge Function: fetch basic OpenGraph/SEO preview for a URL.
// Returns: { url, title?, description?, image?, siteName? }

type Preview = { url: string; title?: string; description?: string; image?: string; siteName?: string }

function escapeReKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** og/twitter meta: поддерживает и `property` до `content`, и наоборот. */
function pickMeta(html: string, attr: 'property' | 'name', key: string): string | null {
  const k = escapeReKey(key)
  const a = attr === 'property' ? 'property' : 'name'
  let m = html.match(new RegExp(`<meta[^>]+${a}=["']${k}["'][^>]+content=["']([^"']+)["']`, 'i'))
  if (m?.[1]) return m[1].trim()
  m = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${a}=["']${k}["']`, 'i'))
  return m?.[1] ? m[1].trim() : null
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)
  return m && m[1] ? m[1].trim() : null
}

function isYoutubeHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'youtube.com' || h === 'www.youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com' || h === 'youtu.be' || h === 'www.youtu.be'
}

/** YouTube часто не отдаёт ботам полноценный HTML с og:* — используем официальный oEmbed. */
async function previewFromYoutubeOEmbed(pageUrl: string): Promise<Preview | null> {
  try {
    const u = new URL(pageUrl)
    if (!isYoutubeHost(u.hostname)) return null
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(pageUrl)}`
    const r = await fetch(oembedUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; vmix-replacer-link-preview/1.0)',
        accept: 'application/json',
      },
    })
    if (!r.ok) return null
    const j = (await r.json()) as {
      title?: string
      author_name?: string
      thumbnail_url?: string
      provider_name?: string
    }
    const title = typeof j.title === 'string' && j.title.trim() ? j.title.trim() : null
    if (!title) return null
    const out: Preview = {
      url: pageUrl,
      title,
      siteName: typeof j.provider_name === 'string' && j.provider_name.trim() ? j.provider_name.trim() : 'YouTube',
    }
    if (typeof j.thumbnail_url === 'string' && j.thumbnail_url.trim()) out.image = j.thumbnail_url.trim()
    if (typeof j.author_name === 'string' && j.author_name.trim()) out.description = j.author_name.trim()
    return out
  } catch {
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'invalid_url' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(JSON.stringify({ error: 'invalid_url' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }

    if (isYoutubeHost(parsedUrl.hostname)) {
      const yt = await previewFromYoutubeOEmbed(url)
      if (yt) {
        return new Response(JSON.stringify(yt), { headers: { 'content-type': 'application/json' } })
      }
    }

    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; vmix-replacer-link-preview/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.toLowerCase().includes('text/html')) {
      const out: Preview = { url }
      return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } })
    }
    const html = await res.text()

    const title =
      pickMeta(html, 'property', 'og:title') ||
      pickMeta(html, 'name', 'twitter:title') ||
      pickTitle(html) ||
      undefined
    const description =
      pickMeta(html, 'property', 'og:description') ||
      pickMeta(html, 'name', 'description') ||
      pickMeta(html, 'name', 'twitter:description') ||
      undefined
    const image =
      pickMeta(html, 'property', 'og:image') ||
      pickMeta(html, 'name', 'twitter:image') ||
      undefined
    const siteName = pickMeta(html, 'property', 'og:site_name') || undefined

    const out: Preview = {
      url,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
      ...(siteName ? { siteName } : {}),
    }
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'preview_failed'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}
