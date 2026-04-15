// Supabase Edge Function: fetch basic OpenGraph/SEO preview for a URL.
// Returns: { url, title?, description?, image?, siteName? }

type Preview = { url: string; title?: string; description?: string; image?: string; siteName?: string }

function pickMeta(html: string, attr: 'property' | 'name', key: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
  const m = html.match(re)
  return m && m[1] ? m[1].trim() : null
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)
  return m && m[1] ? m[1].trim() : null
}

export default async function handler(req: Request): Promise<Response> {
  try {
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!/^https?:\/\//i.test(url)) {
      return new Response(JSON.stringify({ error: 'invalid_url' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }

    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; vmix-replacer-link-preview/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
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

    const out: Preview = { url, ...(title ? { title } : {}), ...(description ? { description } : {}), ...(image ? { image } : {}), ...(siteName ? { siteName } : {}) }
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'preview_failed'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}

