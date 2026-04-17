import type { MessageLinkMeta } from '../../lib/linkPreview'
import { extractYoutubeVideoId, youtubeEmbedIframeSrc } from '../../lib/youtubeEmbed'

type LinkLike = Pick<MessageLinkMeta, 'url' | 'title' | 'description' | 'image' | 'siteName'>

export function MessengerLinkPreviewCard({ link }: { link: LinkLike }) {
  const hostLabel = (() => {
    try {
      return new URL(link.url).host
    } catch {
      return link.url
    }
  })()

  const ytId = extractYoutubeVideoId(link.url)
  if (ytId) {
    return (
      <div className="messenger-link-preview-card messenger-link-preview-card--youtube">
        <div className="messenger-link-preview-card__embed">
          <iframe
            src={youtubeEmbedIframeSrc(ytId)}
            title={link.title ?? 'YouTube'}
            loading="lazy"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="messenger-link-preview-card__yt-bar messenger-message-link"
        >
          <div className="messenger-link-preview-card__text">
            <div className="messenger-link-preview-card__title">{link.title ?? link.siteName ?? 'YouTube'}</div>
            {link.description ? (
              <div className="messenger-link-preview-card__desc">{link.description}</div>
            ) : null}
            <div className="messenger-link-preview-card__host">{link.siteName ?? 'YouTube'}</div>
          </div>
        </a>
      </div>
    )
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="messenger-link-preview-card messenger-message-link"
    >
      <div className="messenger-link-preview-card__row">
        {link.image ? (
          <img
            className="messenger-link-preview-card__img"
            src={link.image}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="messenger-link-preview-card__text">
          <div className="messenger-link-preview-card__title">{link.title ?? link.siteName ?? link.url}</div>
          {link.description ? (
            <div className="messenger-link-preview-card__desc">{link.description}</div>
          ) : null}
          <div className="messenger-link-preview-card__host">{link.siteName ?? hostLabel}</div>
        </div>
      </div>
    </a>
  )
}
