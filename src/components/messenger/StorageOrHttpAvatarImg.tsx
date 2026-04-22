import { useEffect, useState, type ReactNode } from 'react'
import { resolveMediaUrlForStoragePath } from '../../lib/mediaCache'

function isHttpAvatarSrc(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

/**
 * `<img>` для аватара: готовый http(s) URL или путь в bucket `messenger-media` (signed/cache).
 */
export function StorageOrHttpAvatarImg({
  src,
  alt = '',
  className,
  fallback,
}: {
  src: string
  alt?: string
  className?: string
  /** Пока грузим или при ошибке. */
  fallback?: ReactNode
}) {
  const trimmed = src.trim()
  const [resolved, setResolved] = useState<string | null>(() => (isHttpAvatarSrc(trimmed) ? trimmed : null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const s = src.trim()
    setFailed(false)
    if (!s) {
      setResolved(null)
      return
    }
    if (isHttpAvatarSrc(s)) {
      setResolved(s)
      return
    }
    let cancelled = false
    setResolved(null)
    void resolveMediaUrlForStoragePath(s).then((u) => {
      if (cancelled) return
      if (u) setResolved(u)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  if (failed) return <>{fallback ?? null}</>
  if (!resolved) return <>{fallback ?? null}</>

  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
