import { useEffect, useState } from 'react'
import { resolveMediaUrlForStoragePath } from '../lib/mediaCache'

/** Миниатюра для цитаты ответа (kind=image). */
export function MessengerReplyMiniThumb({
  thumbPath,
  onThumbLayout,
}: {
  thumbPath: string
  /** После decode миниатюры (догон скролла к низу, если пользователь у хвоста). */
  onThumbLayout?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    void (async () => {
      const u = await resolveMediaUrlForStoragePath(thumbPath, { expiresSec: 3600 })
      if (!cancelled && u) setUrl(u)
    })()
    return () => {
      cancelled = true
    }
  }, [thumbPath])

  if (!url) {
    return <span className="dashboard-messenger__reply-quote-thumb-fallback" aria-hidden>…</span>
  }
  return (
    <img
      src={url}
      alt=""
      className="dashboard-messenger__reply-quote-thumb"
      draggable={false}
      onLoad={() => onThumbLayout?.()}
    />
  )
}
