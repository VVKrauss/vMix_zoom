import { useMemo, useState } from 'react'
import { youtubeThumbnailFallbackChain } from '../../lib/postEditor/youtube'

export function YoutubePosterImg({
  videoId,
  className,
  alt = '',
}: {
  videoId: string
  className?: string
  alt?: string
}) {
  const chain = useMemo(() => youtubeThumbnailFallbackChain(videoId), [videoId])
  const [idx, setIdx] = useState(0)
  const src = chain[Math.min(idx, chain.length - 1)] ?? ''
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setIdx((i) => (i + 1 < chain.length ? i + 1 : i))}
    />
  )
}
