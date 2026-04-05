import { useEffect, useState } from 'react'

export type VideoOrientation = 'portrait' | 'landscape' | 'square'

/**
 * Ориентация по настройкам видеодорожки (и периодическое обновление — трек может позже выдать размеры).
 * Для экрана/десктопа задавайте forceLandscape.
 */
export function useVideoOrientation(
  stream: MediaStream | null,
  options?: { forceLandscape?: boolean },
): VideoOrientation {
  const [o, setO] = useState<VideoOrientation>('landscape')

  useEffect(() => {
    if (options?.forceLandscape) {
      setO('landscape')
      return
    }
    if (!stream) {
      setO('landscape')
      return
    }

    const read = () => {
      const t = stream.getVideoTracks()[0]
      if (!t || t.readyState !== 'live') {
        setO('landscape')
        return
      }
      const s = t.getSettings() as MediaTrackSettings & { width?: number; height?: number }
      const w = s.width
      const h = s.height
      if (!w || !h || w <= 0 || h <= 0) {
        setO('landscape')
        return
      }
      const r = w / h
      if (r < 0.88) setO('portrait')
      else if (r > 1.14) setO('landscape')
      else setO('square')
    }

    read()

    const t = stream.getVideoTracks()[0]
    const onEnded = () => read()
    t?.addEventListener('ended', onEnded)
    const iv = window.setInterval(read, 1200)

    return () => {
      window.clearInterval(iv)
      t?.removeEventListener('ended', onEnded)
    }
  }, [stream, options?.forceLandscape])

  return o
}
