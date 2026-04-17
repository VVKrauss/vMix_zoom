import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DirectMessage } from '../lib/messenger'
import { getMessengerImageAttachments, getMessengerImageSignedUrl } from '../lib/messenger'
import { MessengerMessageBody } from './MessengerMessageBody'

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
            getMessengerImageSignedUrl(thumbPath),
            getMessengerImageSignedUrl(path),
          ])
          thumb = tr.url
          full = fr.url ?? tr.url
        } else {
          const fr = await getMessengerImageSignedUrl(path)
          full = fr.url
          thumb = fr.url
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
          const r = await getMessengerImageSignedUrl(attachments[i]!.path.trim())
          u = r.url
        }
        if (u) resolved.push(u)
      }
      if (resolved.length === 0) return
      const idx = Math.max(0, Math.min(index, resolved.length - 1))
      onOpenImageLightbox({ urls: resolved, initialIndex: idx })
    },
    [attachments, fullUrls, thumbUrls, onOpenImageLightbox],
  )

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

    return (
      <div className="messenger-bubble-stack">
        <div className="messenger-bubble-images">
          {attachments.map((_, i) => {
            const previewUrl = thumbUrls[i] ?? fullUrls[i]
            return previewUrl ? (
              <button
                key={`${message.id}-img-${i}`}
                type="button"
                className="messenger-bubble-images__cell"
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
  return <MessengerMessageBody text={message.body} onMentionSlug={onMentionSlug} />
}
