import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { PostBlock, PostDraftV1 } from '../../lib/postEditor/types'
import { extractYoutubeVideoId } from '../../lib/postEditor/youtube'
import { YoutubePosterImg } from './YoutubePosterImg'
import { detectVideoProvider, faviconUrlForPage, videoOpenActionLabel } from '../../lib/postEditor/videoProvider'

function resolveSrc(url: string, urlByStoragePath: Record<string, string>): string | null {
  const raw = (url ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('ms://')) {
    const p = raw.slice('ms://'.length)
    return urlByStoragePath[p] ?? null
  }
  return raw
}

function draftMdComponents(
  urlByStoragePath: Record<string, string>,
  variant: 'block' | 'inline',
): Components {
  const img = ({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => {
    const raw = (src ?? '').trim()
    const resolved = resolveSrc(raw, urlByStoragePath)
    if (!resolved) return null
    return (
      <img
        {...props}
        src={resolved}
        alt={alt ?? ''}
        loading="lazy"
        decoding="async"
        className="post-draft-read__md-img"
      />
    )
  }
  const a = ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props} href={href} target="_blank" rel="noopener noreferrer" className="post-draft-read__md-a">
      {children}
    </a>
  )
  if (variant === 'inline') {
    return {
      a,
      img,
      p: ({ children }) => <>{children}</>,
      del: ({ children }) => <del className="post-draft-read__md-del">{children}</del>,
    }
  }
  return {
    a,
    img,
    del: ({ children }) => <del className="post-draft-read__md-del">{children}</del>,
  }
}

function DraftInlineMarkdown({
  text,
  urlByStoragePath,
  variant = 'block',
  className,
}: {
  text: string
  urlByStoragePath: Record<string, string>
  variant?: 'block' | 'inline'
  className?: string
}) {
  const md = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={draftMdComponents(urlByStoragePath, variant)}>
      {text}
    </ReactMarkdown>
  )
  if (variant === 'inline') {
    return (
      <span className={className} style={{ display: 'contents' }}>
        {md}
      </span>
    )
  }
  return <div className={['post-draft-read__md', className].filter(Boolean).join(' ')}>{md}</div>
}

function YoutubePlayBadge() {
  return (
    <svg className="post-draft-read__video-youtube" viewBox="0 0 68 48" width="68" height="48" aria-hidden>
      <path
        fill="#f00"
        d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.08 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.08-16.26z"
      />
      <path fill="#fff" d="M27 14L45 24 27 34z" />
    </svg>
  )
}

function FallbackPlayBadge() {
  return (
    <svg className="post-draft-read__video-play-fallback" viewBox="0 0 48 48" width="48" height="48" aria-hidden>
      <circle cx="24" cy="24" r="22" fill="rgba(0,0,0,0.55)" />
      <path fill="#fff" d="M19 15v18l14-9z" />
    </svg>
  )
}

function VideoProviderBadge({ url }: { url: string }) {
  const [iconBroken, setIconBroken] = useState(false)
  const kind = detectVideoProvider(url)
  if (kind === 'youtube') {
    return <YoutubePlayBadge />
  }
  const fav = faviconUrlForPage(url)
  if (!fav || iconBroken) {
    return <FallbackPlayBadge />
  }
  return (
    <img
      src={fav}
      alt=""
      className="post-draft-read__video-provider-icon"
      onError={() => setIconBroken(true)}
    />
  )
}

function formatPublicationDateTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Дата/время публикации (и правки) — для ленты канала и черновика с переданными метками. */
export function PostPublicationLine({
  publishedAt,
  editedAt,
  className,
}: {
  publishedAt: string
  editedAt?: string | null
  className?: string
}) {
  const showEdited = Boolean(editedAt?.trim() && editedAt !== publishedAt)
  return (
    <div className={['post-draft-read__publine', className].filter(Boolean).join(' ')}>
      <time dateTime={publishedAt}>{formatPublicationDateTime(publishedAt)}</time>
      {showEdited ? (
        <span className="post-draft-read__publine-edited">
          {' · '}
          изменено{' '}
          <time dateTime={editedAt!}>{formatPublicationDateTime(editedAt!)}</time>
        </span>
      ) : null}
    </div>
  )
}

export function PostDraftReadView({
  draft,
  urlByStoragePath,
  className,
  publishedAt,
  editedAt,
}: {
  draft: PostDraftV1
  urlByStoragePath: Record<string, string>
  className?: string
  /** ISO-время публикации сообщения (из БД); в превью редактора не передаётся. */
  publishedAt?: string
  editedAt?: string | null
}) {
  const cover = draft.coverImage ? resolveSrc(draft.coverImage, urlByStoragePath) : null
  return (
    <div className={['post-draft-read', className].filter(Boolean).join(' ')}>
      {publishedAt ? <PostPublicationLine publishedAt={publishedAt} editedAt={editedAt} /> : null}
      {cover ? (
        <div className="post-draft-read__cover">
          <img src={cover} alt="" />
        </div>
      ) : null}
      {draft.title.trim() ? <h1 className="post-draft-read__title">{draft.title.trim()}</h1> : null}
      {draft.subtitle?.trim() ? (
        <div className="post-draft-read__subtitle post-draft-read__subtitle--md">
          <DraftInlineMarkdown
            text={draft.subtitle.trim()}
            urlByStoragePath={urlByStoragePath}
            variant="block"
          />
        </div>
      ) : null}
      <div className="post-draft-read__body">
        {draft.blocks.map((b) => (
          <BlockRead key={b.id} block={b} urlByStoragePath={urlByStoragePath} />
        ))}
      </div>
      {draft.materials.length > 0 ? (
        <div className="post-draft-read__materials">
          <h3 className="post-draft-read__materials-title">Материалы</h3>
          <ul className="post-draft-read__materials-list">
            {draft.materials.map((m) => (
              <li key={m.id} className="post-draft-read__materials-item">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="post-draft-read__materials-link">
                  {m.title || m.url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function BlockRead({ block, urlByStoragePath }: { block: PostBlock; urlByStoragePath: Record<string, string> }) {
  switch (block.type) {
    case 'paragraph':
      return block.text.trim() ? (
        <DraftInlineMarkdown
          text={block.text}
          urlByStoragePath={urlByStoragePath}
          variant="block"
          className="post-draft-read__p"
        />
      ) : null
    case 'heading2':
      return block.text.trim() ? (
        <h2 className="post-draft-read__h2 post-draft-read__h2--md">
          <DraftInlineMarkdown text={block.text} urlByStoragePath={urlByStoragePath} variant="inline" />
        </h2>
      ) : null
    case 'heading3':
      return block.text.trim() ? (
        <h3 className="post-draft-read__h3 post-draft-read__h3--md">
          <DraftInlineMarkdown text={block.text} urlByStoragePath={urlByStoragePath} variant="inline" />
        </h3>
      ) : null
    case 'image': {
      const src = resolveSrc(block.url, urlByStoragePath)
      if (!src) return null
      return (
        <figure className="post-draft-read__figure">
          <img src={src} alt={block.caption ?? ''} />
          {block.caption?.trim() ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      )
    }
    case 'gallery':
      return (
        <div className="post-draft-read__gallery">
          {block.items.map((it, i) => {
            const src = resolveSrc(it.url, urlByStoragePath)
            if (!src) return null
            return <img key={i} src={src} alt={it.caption ?? ''} />
          })}
        </div>
      )
    case 'quote':
      return block.text.trim() ? (
        <blockquote className="post-draft-read__quote">
          <DraftInlineMarkdown
            text={block.text}
            urlByStoragePath={urlByStoragePath}
            variant="block"
            className="post-draft-read__md--in-quote"
          />
          {block.author?.trim() ? <cite>— {block.author}</cite> : null}
        </blockquote>
      ) : null
    case 'divider':
      return <hr className="post-draft-read__hr" />
    case 'video': {
      const vid = extractYoutubeVideoId(block.url)
      const externalThumb = !vid && block.thumbnail?.trim() ? block.thumbnail.trim() : null
      const provider = detectVideoProvider(block.url)
      const openLabel = videoOpenActionLabel(provider)
      return (
        <div className="post-draft-read__video">
          <a
            href={block.url}
            target="_blank"
            rel="noopener noreferrer"
            className="post-draft-read__video-thumb-link"
            aria-label={openLabel}
          >
            {vid ? (
              <YoutubePosterImg videoId={vid} className="post-draft-read__video-thumb-img" alt="" />
            ) : externalThumb ? (
              <img src={externalThumb} alt="" className="post-draft-read__video-thumb-img" />
            ) : (
              <div className="post-draft-read__video-thumb-placeholder" aria-hidden />
            )}
            <span className="post-draft-read__video-badge" aria-hidden>
              <VideoProviderBadge url={block.url} />
            </span>
          </a>
          <div className="post-draft-read__video-meta">
            <div className="post-draft-read__video-title">{block.title ?? 'Видео'}</div>
            {block.description ? <div className="post-draft-read__video-desc">{block.description}</div> : null}
            <a
              href={block.url}
              target="_blank"
              rel="noopener noreferrer"
              className="dashboard-topbar__action post-draft-read__video-open"
            >
              {openLabel}
            </a>
          </div>
        </div>
      )
    }
    case 'linkCard':
      return (
        <a className="post-draft-read__linkcard" href={block.url} target="_blank" rel="noopener noreferrer">
          {block.image ? <img src={block.image} alt="" /> : null}
          <div>
            <div className="post-draft-read__linkcard-title">{block.title ?? block.url}</div>
            {block.description ? <div className="post-draft-read__linkcard-desc">{block.description}</div> : null}
            <div className="post-draft-read__linkcard-host">{tryHost(block.url)}</div>
          </div>
        </a>
      )
    case 'cta':
      return (
        <div className="post-draft-read__cta-wrap">
          <a className="post-draft-read__cta" href={block.url} target="_blank" rel="noopener noreferrer">
            {block.text || 'Перейти'}
          </a>
        </div>
      )
    default:
      return null
  }
}

function tryHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
