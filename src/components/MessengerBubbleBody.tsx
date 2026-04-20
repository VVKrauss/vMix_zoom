import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DirectMessage } from '../lib/messenger'
import { getMessengerImageAttachments } from '../lib/messenger'
import { resolveMediaUrlForStoragePath } from '../lib/mediaCache'
import { MessengerMessageBody } from './MessengerMessageBody'
import { MessengerLinkOgCard } from './messenger/MessengerLinkOgCard'
import { MessengerAudioPlayer } from './messenger/MessengerAudioPlayer'

export type MessengerImageLightboxOpen = {
  urls: string[]
  initialIndex: number
}

export function MessengerBubbleBody({
  message,
  onOpenImageLightbox,
  onInlineImageLayout,
  onMentionSlug,
}: {
  message: DirectMessage
  /** Полноэкран: массив URL и индекс (галерея в одном сообщении). */
  onOpenImageLightbox?: (ctx: MessengerImageLightboxOpen) => void
  /** После decode/раскладки превью в ленте (догон скролла к низу). */
  onInlineImageLayout?: () => void
  onMentionSlug?: (slug: string) => void
}) {
  const attachments = useMemo(
    () => (message.kind === 'image' ? getMessengerImageAttachments(message) : []),
    [message.kind, message.meta],
  )

  const audioPath =
    message.kind === 'audio' ? message.meta?.audio?.path?.trim() ?? '' : ''
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioErr, setAudioErr] = useState(false)

  useEffect(() => {
    if (!audioPath) {
      setAudioUrl(null)
      setAudioErr(false)
      return
    }
    let cancelled = false
    setAudioErr(false)
    void (async () => {
      const u = await resolveMediaUrlForStoragePath(audioPath, { expiresSec: 3600 })
      if (cancelled) return
      if (!u) setAudioErr(true)
      setAudioUrl(u)
    })()
    return () => {
      cancelled = true
    }
  }, [audioPath])

  const [thumbUrls, setThumbUrls] = useState<(string | null)[]>([])
  const [fullUrls, setFullUrls] = useState<(string | null)[]>([])
  const [imageErr, setImageErr] = useState(false)

  useEffect(() => {
    if (attachments.length === 0) {
      setThumbUrls([])
      setFullUrls([])
      setImageErr(false)
      return
    }
    let cancelled = false
    setImageErr(false)
    setThumbUrls(Array(attachments.length).fill(null))
    setFullUrls(Array(attachments.length).fill(null))

    void (async () => {
      const thumbs: (string | null)[] = []
      const fulls: (string | null)[] = []
      for (let i = 0; i < attachments.length; i++) {
        const a = attachments[i]!
        const thumbPath = a.thumbPath?.trim()
        const path = a.path.trim()
        let thumb: string | null = null
        let full: string | null = null
        if (thumbPath) {
          const [tr, fr] = await Promise.all([
            resolveMediaUrlForStoragePath(thumbPath, { expiresSec: 3600 }),
            resolveMediaUrlForStoragePath(path, { expiresSec: 3600 }),
          ])
          thumb = tr
          full = fr ?? tr
        } else {
          const fr = await resolveMediaUrlForStoragePath(path, { expiresSec: 3600 })
          full = fr
          thumb = fr
        }
        thumbs.push(thumb)
        fulls.push(full)
      }
      if (cancelled) return
      if (thumbs.some((u) => !u) && fulls.every((u) => !u)) setImageErr(true)
      setThumbUrls(thumbs)
      setFullUrls(fulls)
    })()

    return () => {
      cancelled = true
    }
  }, [attachments])

  const openLightboxAt = useCallback(
    async (index: number) => {
      if (!onOpenImageLightbox || attachments.length === 0) return
      const resolved: string[] = []
      for (let i = 0; i < attachments.length; i++) {
        let u = fullUrls[i] ?? thumbUrls[i]
        if (!u) {
          u = await resolveMediaUrlForStoragePath(attachments[i]!.path.trim(), { expiresSec: 3600 })
        }
        if (u) resolved.push(u)
      }
      if (resolved.length === 0) return
      const idx = Math.max(0, Math.min(index, resolved.length - 1))
      onOpenImageLightbox({ urls: resolved, initialIndex: idx })
    },
    [attachments, fullUrls, thumbUrls, onOpenImageLightbox],
  )

  if (message.kind === 'audio') {
    const durationMeta = message.meta?.audio?.durationSec
    return (
      <div className="messenger-bubble-stack messenger-bubble-stack--audio">
        <div className="messenger-audio-row">
          {audioUrl && !audioErr ? (
            <MessengerAudioPlayer
              src={audioUrl}
              durationSecMeta={typeof durationMeta === 'number' && Number.isFinite(durationMeta) ? durationMeta : undefined}
              onReady={() => onInlineImageLayout?.()}
            />
          ) : (
            <span className="messenger-message-img-missing" role="status">
              {audioErr ? 'Аудио недоступно' : 'Загрузка…'}
            </span>
          )}
        </div>
        {message.body.trim() ? (
          <div className="messenger-message-caption">
            <MessengerMessageBody text={message.body} onMentionSlug={onMentionSlug} />
          </div>
        ) : null}
      </div>
    )
  }

  if (message.kind === 'image') {
    if (attachments.length === 0) {
      return (
        <div className="messenger-bubble-stack">
          <span className="messenger-message-img-missing">Изображение недоступно</span>
          {message.body.trim() ? (
            <div className="messenger-message-caption">
              <MessengerMessageBody text={message.body} onMentionSlug={onMentionSlug} />
            </div>
          ) : null}
        </div>
      )
    }

    if (attachments.length === 1) {
      const previewUrl = thumbUrls[0] ?? fullUrls[0]
      const hrefForNewTab = fullUrls[0] || previewUrl

      return (
        <div className="messenger-bubble-stack">
          {previewUrl ? (
            <div className="messenger-bubble-thumb-box">
              {onOpenImageLightbox ? (
                <button
                  type="button"
                  className="messenger-message-img-link messenger-message-img-trigger"
                  onClick={() => void openLightboxAt(0)}
                  aria-label="Открыть изображение"
                >
                  <img
                    className="messenger-message-img messenger-message-img--preview"
                    src={previewUrl}
                    alt=""
                    loading="eager"
                    decoding="async"
                    onLoad={() => onInlineImageLayout?.()}
                  />
                </button>
              ) : (
                <a
                  href={hrefForNewTab || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="messenger-message-img-link"
                >
                  <img
                    className="messenger-message-img messenger-message-img--preview"
                    src={previewUrl}
                    alt=""
                    loading="eager"
                    decoding="async"
                    onLoad={() => onInlineImageLayout?.()}
                  />
                </a>
              )}
            </div>
          ) : (
            <span className="messenger-message-img-missing">
              {imageErr ? 'Изображение недоступно' : 'Загрузка…'}
            </span>
          )}
          {message.body.trim() ? (
            <div className="messenger-message-caption">
              <MessengerMessageBody text={message.body} onMentionSlug={onMentionSlug} />
            </div>
          ) : null}
        </div>
      )
    }

    const n = attachments.length
    const gridCount = Math.min(n, 9)
    const mediaClass = `msg-chat-media msg-chat-media--n${gridCount}`

    return (
      <div className="messenger-bubble-stack">
        <div className={mediaClass}>
          {attachments.slice(0, 9).map((_, i) => {
            const previewUrl = thumbUrls[i] ?? fullUrls[i]
            return previewUrl ? (
              <button
                key={`${message.id}-img-${i}`}
                type="button"
                className="msg-chat-media__cell"
                aria-label={`Фото ${i + 1} из ${attachments.length}`}
                onClick={() => void openLightboxAt(i)}
              >
                <img
                  src={previewUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onLoad={i === 0 ? () => onInlineImageLayout?.() : undefined}
                />
              </button>
            ) : (
              <div key={`${message.id}-img-${i}`} className="messenger-message-img-missing">
                {imageErr ? '—' : '…'}
              </div>
            )
          })}
        </div>
        {message.body.trim() ? (
          <div className="messenger-message-caption">
            <MessengerMessageBody text={message.body} onMentionSlug={onMentionSlug} />
          </div>
        ) : null}
      </div>
    )
  }
  const link = message.kind === 'text' && message.meta?.link?.url?.trim() ? message.meta.link : null
  return (
    <div
      className={`messenger-bubble-stack messenger-bubble-stack--text${link ? ' messenger-bubble-stack--link-first' : ''}`}
    >
      {link ? <MessengerLinkOgCard link={link} className="messenger-link-preview-card" /> : null}
      <MessengerMessageBody text={message.body} onMentionSlug={onMentionSlug} />
    </div>
  )
}
