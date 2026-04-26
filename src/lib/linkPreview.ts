import { extractYoutubeVideoId, fetchYoutubeOembedMeta, youtubeThumbnailUrl } from './youtubeEmbed'
import { fetchJson } from '../api/http'

/** Edge `link-preview` не должна «висеть» без ответа (invoke без таймаута). */
const LINK_PREVIEW_INVOKE_MS = 8000

export type LinkPreview = {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

const TRAIL_PUNCT = /[.,;:!?)]+$/

/** Ссылка на само приложение: Edge не достучится до localhost; для того же origin OG с SPA обычно пустой — не дергаем preview. */
function isInternalAppUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    const host = u.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true
    if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
      const origin = (globalThis as unknown as { location?: { origin?: string } }).location?.origin
      if (origin && u.origin === origin) return true
    }
    return false
  } catch {
    return false
  }
}

/** Есть ли что показать в карточке кроме голого URL (иначе оставляем только текст со ссылкой). */
function linkPreviewHasDisplayableMeta(p: LinkPreview): boolean {
  return Boolean(
    p.title?.trim() || p.description?.trim() || p.image?.trim() || p.siteName?.trim(),
  )
}

/** Превью для ссылок на мессенджер (OG с SPA часто пустой). */
function tryMessengerDeepLinkPreview(url: string): LinkPreview | null {
  try {
    const u = new URL(url.trim())
    if (!u.pathname.includes('/dashboard/messenger')) return null
    const hasChat = Boolean(u.searchParams.get('chat')?.trim())
    if (!hasChat) return null
    const msg = u.searchParams.get('msg')?.trim()
    const post = u.searchParams.get('post')?.trim()
    if (msg && post) {
      return {
        url: u.href,
        title: 'Комментарий к посту',
        description: 'Откройте в мессенджере',
        siteName: 'Мессенджер',
      }
    }
    if (msg) {
      return {
        url: u.href,
        title: 'Пост в канале',
        description: 'Откройте в мессенджере',
        siteName: 'Мессенджер',
      }
    }
    return {
      url: u.href,
      title: 'Чат',
      description: 'Откройте в мессенджере',
      siteName: 'Мессенджер',
    }
  } catch {
    return null
  }
}

/** Первый http(s) URL в тексте (в т.ч. `www.` → https). */
export function extractFirstHttpUrl(text: string): string | null {
  const re = /\b(https?:\/\/[^\s<>\]'"`]+|www\.[^\s<>\]'"`]+)/i
  const m = re.exec(text)
  if (!m?.[0]) return null
  let raw = m[0].replace(TRAIL_PUNCT, '')
  if (!raw) return null
  if (/^www\./i.test(raw)) raw = `https://${raw}`
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

/** Сравнение URL после нормализации (игнор хвостового `/`, регистр хоста). */
export function urlsLooselyEqual(a: string, b: string): boolean {
  const yta = extractYoutubeVideoId(a)
  const ytb = extractYoutubeVideoId(b)
  if (yta && ytb) return yta === ytb
  try {
    const ua = new URL(a.startsWith('http') ? a : `https://${a}`)
    const ub = new URL(b.startsWith('http') ? b : `https://${b}`)
    const norm = (u: URL) =>
      `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '') || ''}${u.search}`
    return norm(ua) === norm(ub)
  } catch {
    return a.trim() === b.trim()
  }
}

export type MessageLinkMeta = {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

/** Если в тексте есть URL и превью относится к нему — meta для RPC. */
export function buildLinkMetaForMessageBody(body: string, preview: LinkPreview | null): { link: MessageLinkMeta } | null {
  if (!preview?.url?.trim()) return null
  const first = extractFirstHttpUrl(body)
  if (!first || !urlsLooselyEqual(first, preview.url)) return null
  const link: MessageLinkMeta = { url: preview.url.trim() }
  if (preview.title?.trim()) link.title = preview.title.trim()
  if (preview.description?.trim()) link.description = preview.description.trim()
  if (preview.image?.trim()) link.image = preview.image.trim()
  if (preview.siteName?.trim()) link.siteName = preview.siteName.trim()
  return { link }
}

/**
 * Перед отправкой: если в тексте есть URL, гарантированно запрашиваем превью
 * (черновик мог отправить до дебаунса или fetch в useLinkPreviewFromText не успел).
 */
export async function ensureLinkPreviewForBody(
  body: string,
  cached: LinkPreview | null,
): Promise<LinkPreview | null> {
  const first = extractFirstHttpUrl(body)
  if (!first) return null
  if (cached && urlsLooselyEqual(first, cached.url)) return cached
  const { data, error } = await fetchLinkPreview(first)
  return !error && data ? data : null
}

export async function fetchLinkPreview(url: string): Promise<{ data: LinkPreview | null; error: string | null }> {
  const u = url.trim()
  if (!u) return { data: null, error: 'empty_url' }

  const vid = extractYoutubeVideoId(u)
  if (vid) {
    const oembed = await fetchYoutubeOembedMeta(u)
    const out: LinkPreview = {
      url: u,
      title: oembed.title ?? 'Видео YouTube',
      image: youtubeThumbnailUrl(vid),
      siteName: 'YouTube',
      ...(oembed.author_name ? { description: oembed.author_name } : {}),
    }
    return { data: out, error: null }
  }

  const internal = tryMessengerDeepLinkPreview(u)
  if (internal) return { data: internal, error: null }

  if (isInternalAppUrl(u)) {
    return { data: null, error: null }
  }

  type InvokeRet = { data: any; error: { message: string } | null }
  let invoked: InvokeRet
  try {
    invoked = await Promise.race([
      (async () => {
        const r = await fetchJson(`/api/functions/link-preview`, {
          method: 'POST',
          auth: true,
          body: JSON.stringify({ url: u }),
        })
        return r.ok ? { data: r.data, error: null } : { data: null, error: { message: r.error.message } }
      })(),
      new Promise<never>((_, rej) => {
        globalThis.setTimeout(() => rej(new Error('link_preview_timeout')), LINK_PREVIEW_INVOKE_MS)
      }),
    ])
  } catch {
    return { data: null, error: null }
  }

  const { data, error } = invoked
  if (error) return { data: null, error: error.message }
  if (!data || typeof data !== 'object') return { data: null, error: 'bad_preview' }
  const r = data as Record<string, unknown>
  if (typeof r.error === 'string' && r.error.trim()) return { data: null, error: r.error.trim() }
  const out: LinkPreview = { url: typeof r.url === 'string' && r.url.trim() ? r.url.trim() : u }
  if (typeof r.title === 'string' && r.title.trim()) out.title = r.title.trim()
  if (typeof r.description === 'string' && r.description.trim()) out.description = r.description.trim()
  if (typeof r.image === 'string' && r.image.trim()) out.image = r.image.trim()
  const siteName = (typeof r.siteName === 'string' && r.siteName.trim()
    ? r.siteName
    : typeof r.site_name === 'string' && r.site_name.trim()
      ? r.site_name
      : '') as string
  if (siteName.trim()) out.siteName = siteName.trim()
  if (!linkPreviewHasDisplayableMeta(out)) return { data: null, error: null }
  return { data: out, error: null }
}

