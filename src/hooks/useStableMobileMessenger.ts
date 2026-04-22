import { useEffect, useMemo, useState } from 'react'

/**
 * Prevents layout "strobing" on mobile when user pinch-zooms the page.
 *
 * On some browsers `matchMedia('(max-width: Xpx)')` may emit changes while `visualViewport.scale !== 1`,
 * which can cause both mobile and desktop messenger layouts to alternately render.
 *
 * Strategy: freeze the last stable match while zoomed; recompute when scale returns to 1.
 */
export function useStableMobileMessenger(maxWidthPx = 900): boolean {
  const query = useMemo(() => `(max-width: ${maxWidthPx}px)`, [maxWidthPx])
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const vv = window.visualViewport ?? null

    const isZoomed = () => {
      const s = vv?.scale
      return typeof s === 'number' && Math.abs(s - 1) > 0.001
    }

    const sync = () => {
      // While zoomed we keep the last stable value to avoid flicker.
      if (isZoomed()) return
      setMatches(mq.matches)
    }

    sync()

    const onMq = () => sync()
    mq.addEventListener('change', onMq)

    // Some browsers do not fire mq change reliably; scale changes are the key signal.
    const onVv = () => sync()
    vv?.addEventListener('resize', onVv)
    vv?.addEventListener('scroll', onVv)

    return () => {
      mq.removeEventListener('change', onMq)
      vv?.removeEventListener('resize', onVv)
      vv?.removeEventListener('scroll', onVv)
    }
  }, [query])

  return matches
}

