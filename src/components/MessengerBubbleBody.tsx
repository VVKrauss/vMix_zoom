import { useEffect, useState } from 'react'
import type { DirectMessage } from '../lib/messenger'
import { getMessengerImageSignedUrl } from '../lib/messenger'
import { MessengerMessageBody } from './MessengerMessageBody'

export function MessengerBubbleBody({
  message,
  onOpenImageLightbox,
}: {
  message: DirectMessage
  /** Открыть полноэкранный просмотр вместо новой вкладки */
  onOpenImageLightbox?: (imageUrl: string) => void
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageErr, setImageErr] = useState(false)
  const path = message.kind === 'image' ? message.meta?.image?.path?.trim() : ''

  useEffect(() => {
    if (!path) {
      setImageUrl(null)
      setImageErr(false)
      return
    }
    let cancelled = false
    setImageErr(false)
    void (async () => {
      const { url, error } = await getMessengerImageSignedUrl(path)
      if (cancelled) return
      if (url) setImageUrl(url)
      else {
        setImageUrl(null)
        setImageErr(Boolean(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  if (message.kind === 'image') {
    return (
      <div className="messenger-bubble-stack">
        {imageUrl ? (
          onOpenImageLightbox ? (
            <button
              type="button"
              className="messenger-message-img-link messenger-message-img-trigger"
              onClick={() => onOpenImageLightbox(imageUrl)}
              aria-label="Открыть изображение"
            >
              <img className="messenger-message-img" src={imageUrl} alt="" loading="eager" decoding="async" />
            </button>
          ) : (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="messenger-message-img-link">
              <img className="messenger-message-img" src={imageUrl} alt="" loading="eager" decoding="async" />
            </a>
          )
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
