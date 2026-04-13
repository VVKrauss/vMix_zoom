import { useCallback, useEffect, useState } from 'react'
import type { DirectMessage } from '../lib/messenger'
import { getMessengerImageSignedUrl } from '../lib/messenger'
import { MessengerMessageBody } from './MessengerMessageBody'

export function MessengerBubbleBody({
  message,
  onOpenImageLightbox,
}: {
  message: DirectMessage
  /** Полноэкран: передаётся URL полноразмерного изображения (подпись отдельно). */
  onOpenImageLightbox?: (imageUrl: string) => void
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  const [imageErr, setImageErr] = useState(false)
  const path = message.kind === 'image' ? message.meta?.image?.path?.trim() : ''
  const thumbPath = message.kind === 'image' ? message.meta?.image?.thumbPath?.trim() : ''

  useEffect(() => {
    if (!path) {
      setPreviewUrl(null)
      setFullUrl(null)
      setImageErr(false)
      return
    }
    let cancelled = false
    setImageErr(false)
    setPreviewUrl(null)
    setFullUrl(null)

    void (async () => {
      if (thumbPath) {
        const [thumbRes, fullRes] = await Promise.all([
          getMessengerImageSignedUrl(thumbPath),
          getMessengerImageSignedUrl(path),
        ])
        if (cancelled) return
        if (thumbRes.url) {
          setPreviewUrl(thumbRes.url)
          if (fullRes.url) setFullUrl(fullRes.url)
        } else if (fullRes.url) {
          setPreviewUrl(fullRes.url)
          setFullUrl(fullRes.url)
        } else {
          setImageErr(Boolean(thumbRes.error || fullRes.error))
        }
      } else {
        const { url, error } = await getMessengerImageSignedUrl(path)
        if (cancelled) return
        if (url) {
          setPreviewUrl(url)
          setFullUrl(url)
        } else {
          setImageErr(Boolean(error))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [path, thumbPath])

  const openLightbox = useCallback(async () => {
    if (!path || !onOpenImageLightbox) return
    let url = fullUrl
    if (!url) {
      const r = await getMessengerImageSignedUrl(path)
      url = r.url
    }
    if (url) onOpenImageLightbox(url)
  }, [path, fullUrl, onOpenImageLightbox])

  if (message.kind === 'image') {
    const hrefForNewTab = fullUrl || previewUrl

    return (
      <div className="messenger-bubble-stack">
        {previewUrl ? (
          <div className="messenger-bubble-thumb-box">
            {onOpenImageLightbox ? (
              <button
                type="button"
                className="messenger-message-img-link messenger-message-img-trigger"
                onClick={() => void openLightbox()}
                aria-label="Открыть изображение"
              >
                <img
                  className="messenger-message-img messenger-message-img--preview"
                  src={previewUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
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
            <MessengerMessageBody text={message.body} />
          </div>
        ) : null}
      </div>
    )
  }
  return <MessengerMessageBody text={message.body} />
}
