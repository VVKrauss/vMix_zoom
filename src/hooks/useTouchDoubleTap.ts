import { useCallback, useRef, type TouchEvent } from 'react'

const TAP_SLOP_PX = 18
const DOUBLE_TAP_MS = 420
const DOUBLE_TAP_DIST_PX = 56

/** Двойной тап (touch), логика согласована с DraggablePip. */
export function useTouchDoubleTap(onDoubleTap: () => void, enabled: boolean) {
  const touchTapRef = useRef<{ x0: number; y0: number; t0: number } | null>(null)
  const touchSlopRef = useRef(false)
  const prevTapRef = useRef<{ t: number; x: number; y: number } | null>(null)
  const cbRef = useRef(onDoubleTap)
  cbRef.current = onDoubleTap

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return
      const t = e.touches[0]
      touchTapRef.current = { x0: t.clientX, y0: t.clientY, t0: Date.now() }
      touchSlopRef.current = false
    },
    [enabled],
  )

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return
      const start = touchTapRef.current
      if (!start) return
      const t = e.touches[0]
      if (!t) return
      const ddx = t.clientX - start.x0
      const ddy = t.clientY - start.y0
      if (ddx * ddx + ddy * ddy > TAP_SLOP_PX * TAP_SLOP_PX) touchSlopRef.current = true
    },
    [enabled],
  )

  const onTouchEndCapture = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return
      const start = touchTapRef.current
      touchTapRef.current = null
      if (!start || touchSlopRef.current) return
      if (Date.now() - start.t0 > 320) return
      const t = e.changedTouches[0]
      if (!t) return
      const dx = t.clientX - start.x0
      const dy = t.clientY - start.y0
      if (dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX) return

      const now = Date.now()
      const prev = prevTapRef.current
      if (
        prev &&
        now - prev.t < DOUBLE_TAP_MS &&
        (t.clientX - prev.x) ** 2 + (t.clientY - prev.y) ** 2 < DOUBLE_TAP_DIST_PX * DOUBLE_TAP_DIST_PX
      ) {
        prevTapRef.current = null
        cbRef.current()
        if (e.cancelable) e.preventDefault()
        return
      }
      prevTapRef.current = { t: now, x: t.clientX, y: t.clientY }
    },
    [enabled],
  )

  return { onTouchStart, onTouchMove, onTouchEndCapture }
}
