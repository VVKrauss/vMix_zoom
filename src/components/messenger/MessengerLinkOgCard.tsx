import type { MessageLinkMeta } from '../../lib/linkPreview'
import { extractYoutubeVideoId, youtubeThumbnailUrl } from '../../lib/youtubeEmbed'

export type MessengerLinkOgLike = Pick<MessageLinkMeta, 'url' | 'title' | 'description' | 'image' | 'siteName'>

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function hostInitial(host: string): string {
  const h = host.replace(/^www\./, '')
  const ch = h.charAt(0)
  return ch ? ch.toUpperCase() : '?'
}

/** Не более 100 символов текста; если длиннее — обрезка и `...`. */
function ellipsis100(s: string): string {
  const t = s.trim()
  if (t.length <= 100) return t
  return `${t.slice(0, 100)}...`
}

/**
 * Компактная карточка по данным OG/превью: обложка, заголовок, описание, хост.
 * Без iframe — удобно в узких пузырях (ЛС и др.).
 */
export function MessengerLinkOgCard({
  link,
  className,
}: {
  link: MessengerLinkOgLike
  /** Доп. классы на корневой `<a>` (например `messenger-link-preview-card`). */
  className?: string
}) {
  const url = link.url.trim()
  const ytId = extractYoutubeVideoId(url)
  const hostLabel = hostFromUrl(url)
  const thumbSrc =
    link.image?.trim() || (ytId ? youtubeThumbnailUrl(ytId, 'hqdefault') : null)

  const descRaw = link.description?.trim() ?? ''
  const sourceLabel = (link.siteName?.trim() || hostLabel).trim()
  const titleRaw = (link.title?.trim() || '').trim()
  const showTitle = titleRaw.length > 0 && titleRaw.toLowerCase() !== sourceLabel.toLowerCase()

  const headline = ellipsis100(titleRaw)
  const desc = descRaw ? ellipsis100(descRaw) : ''

  const rootClass = [
    'messenger-link-og-card',
    'messenger-message-link',
    ytId ? 'messenger-link-og-card--youtube' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={rootClass}>
      <div className="messenger-link-og-card__text-block">
        <div className="messenger-link-og-card__site">{sourceLabel}</div>
        {showTitle ? <div className="messenger-link-og-card__title">{headline}</div> : null}
        {desc ? <div className="messenger-link-og-card__desc">{desc}</div> : null}
      </div>
      <div className="messenger-link-og-card__thumb-wrap" aria-hidden>
        {thumbSrc ? (
          <img className="messenger-link-og-card__thumb" src={thumbSrc} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="messenger-link-og-card__thumb-placeholder">{hostInitial(hostLabel)}</div>
        )}
        {ytId ? (
          <span className="messenger-link-og-card__play" title="Видео">
            <svg className="messenger-link-og-card__play-icon" viewBox="0 0 68 48" width="56" height="40" aria-hidden>
              <path
                fill="#f00"
                d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
              />
              <path fill="#fff" d="M45 24 27 14v20l18-10z" />
            </svg>
          </span>
        ) : null}
      </div>
    </a>
  )
}
