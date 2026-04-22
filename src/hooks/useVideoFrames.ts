import { useEffect, useState } from 'react'

/**
 * True when a <video> appears to be receiving frames (even if track is 'live').
 * Heuristic: size known + currentTime advances within a grace window.
 */
export function useVideoFrames(
  videoRef: React.RefObject<HTMLVideoElement>,
  enabled: boolean,
  opts?: { graceMs?: number; pollMs?: number },
): boolean {
  const graceMs = opts?.graceMs ?? 1600
  const pollMs = opts?.pollMs ?? 250
  const [hasFrames, setHasFrames] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setHasFrames(false)
      return
    }
    let cancelled = false
    const startedAt = Date.now()
    let lastTime = -1
    let seenAdvance = false

    const tick = () => {
      if (cancelled) return
      const el = videoRef.current
      if (!el) {
        setHasFrames(false)
        return
      }
      const hasSize = (el.videoWidth ?? 0) > 0 && (el.videoHeight ?? 0) > 0
      const t = el.currentTime ?? 0
      if (lastTime >= 0 && t > lastTime + 0.01) seenAdvance = true
      lastTime = t

      const now = Date.now()
      if (hasSize && seenAdvance) {
        if (!cancelled) setHasFrames(true)
        return
      }
      if (now - startedAt < graceMs) {
        if (!cancelled) setHasFrames(false)
        return
      }
      // Past grace window and still no evidence of frames.
      if (!cancelled) setHasFrames(false)
    }

    tick()
    const id = window.setInterval(tick, pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled, graceMs, pollMs, videoRef])

  return hasFrames
}

