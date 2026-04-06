import { useEffect, useRef, useCallback, ReactNode } from 'react'
import { useSrtCopyMenu } from './SrtCopyMenu'

export interface PipPos  { x: number; y: number }
export interface PipSize { w: number; h: number }

export type PipSrtCopy = {
  connectUrl?: string
  listenPort?: number
  roomId?: string
  peerId?: string
}

interface Props {
  children:      ReactNode
  pos:           PipPos
  size:          PipSize
  onPosChange:   (p: PipPos)  => void
  onSizeChange:  (s: PipSize) => void
  lockAspect?:   number | null
  /** ПКМ на области превью (поверх видео) — копирование SRT; long-press не используем (конфликт с drag). */
  srtCopy?:      PipSrtCopy
  /** Двойной тап по области превью (touch): мобильный PiP — смена порядка гостей в сетке. */
  enableTouchDoubleTap?: boolean
  onTouchDoubleTap?: () => void
}

const MIN_W = 140

function clientXY(e: MouseEvent | TouchEvent): { cx: number; cy: number } {
  if ('touches' in e) {
    const t = e.touches[0] ?? (e as TouchEvent).changedTouches[0]
    return { cx: t.clientX, cy: t.clientY }
  }
  return { cx: (e as MouseEvent).clientX, cy: (e as MouseEvent).clientY }
}

const TAP_SLOP_PX = 18
const DOUBLE_TAP_MS = 420
const DOUBLE_TAP_DIST_PX = 56

export function DraggablePip({
  children, pos, size, onPosChange, onSizeChange, lockAspect, srtCopy,
  enableTouchDoubleTap = false,
  onTouchDoubleTap,
}: Props) {
  const posRef    = useRef(pos)
  const sizeRef   = useRef(size)
  const aspectRef = useRef(lockAspect)
  const cbRef     = useRef({ onPosChange, onSizeChange })
  const onTouchDoubleTapRef = useRef(onTouchDoubleTap)
  onTouchDoubleTapRef.current = onTouchDoubleTap

  posRef.current    = pos
  sizeRef.current   = size
  aspectRef.current = lockAspect
  cbRef.current     = { onPosChange, onSizeChange }

  const dragState   = useRef({ active: false, ox: 0, oy: 0 })
  const resizeState = useRef({ active: false, ox: 0, oy: 0, ow: 0, oh: 0 })
  /** Для двойного тапа: старт касания и флаг «жест не тап» (сдвинули палец). */
  const touchTapRef = useRef<{ x0: number; y0: number; t0: number } | null>(null)
  const touchSlopRef = useRef(false)
  const prevTapRef = useRef<{ t: number; x: number; y: number } | null>(null)

  const srtMenu = useSrtCopyMenu(srtCopy?.connectUrl, srtCopy?.listenPort, {
    enableLongPress: false,
    roomId: srtCopy?.roomId,
    tilePeerId: srtCopy?.peerId,
  })

  useEffect(() => {
    if (lockAspect) {
      onSizeChange({ w: size.w, h: Math.round(size.w / lockAspect) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockAspect])

  // ── Drag start (mouse + touch) ──────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const p = posRef.current
    dragState.current = { active: true, ox: e.clientX - p.x, oy: e.clientY - p.y }
  }, [])

  const onTouchDragStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
    const t = e.touches[0]
    const p = posRef.current
    dragState.current = { active: true, ox: t.clientX - p.x, oy: t.clientY - p.y }
    if (enableTouchDoubleTap && onTouchDoubleTap) {
      touchTapRef.current = { x0: t.clientX, y0: t.clientY, t0: Date.now() }
      touchSlopRef.current = false
    }
  }, [enableTouchDoubleTap, onTouchDoubleTap])

  const onDragTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enableTouchDoubleTap || !onTouchDoubleTap) return
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
        onTouchDoubleTapRef.current?.()
        if (e.cancelable) e.preventDefault()
        return
      }
      prevTapRef.current = { t: now, x: t.clientX, y: t.clientY }
    },
    [enableTouchDoubleTap, onTouchDoubleTap],
  )

  // ── Resize start (mouse + touch) ────────────────────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const s = sizeRef.current
    resizeState.current = { active: true, ox: e.clientX, oy: e.clientY, ow: s.w, oh: s.h }
  }, [])

  const onTouchResizeStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation()
    const t = e.touches[0]
    const s = sizeRef.current
    resizeState.current = { active: true, ox: t.clientX, oy: t.clientY, ow: s.w, oh: s.h }
  }, [])

  // ── Global move / end (mouse + touch) ───────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      const { cx, cy } = clientXY(e)
      if (dragState.current.active) {
        const ts = touchTapRef.current
        if (ts && !touchSlopRef.current) {
          const ddx = cx - ts.x0
          const ddy = cy - ts.y0
          if (ddx * ddx + ddy * ddy > TAP_SLOP_PX * TAP_SLOP_PX) touchSlopRef.current = true
        }
        const s = sizeRef.current
        const x = clamp(cx - dragState.current.ox, 0, window.innerWidth  - s.w)
        const y = clamp(cy - dragState.current.oy, 0, window.innerHeight - s.h - 72)
        cbRef.current.onPosChange({ x, y })
        if ('cancelable' in e && e.cancelable) e.preventDefault()
      }
      if (resizeState.current.active) {
        const r  = resizeState.current
        const la = aspectRef.current
        const w  = Math.max(MIN_W, r.ow + (cx - r.ox))
        const h  = la
          ? Math.round(w / la)
          : Math.max(Math.round(MIN_W * 0.5), r.oh + (cy - r.oy))
        cbRef.current.onSizeChange({ w, h })
        if ('cancelable' in e && e.cancelable) e.preventDefault()
      }
    }
    const onEnd = () => {
      dragState.current.active   = false
      resizeState.current.active = false
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend',  onEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onEnd)
    }
  }, [])

  return (
    <div
      className="pip-float"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div
        className="pip-drag-handle"
        onMouseDown={onDragStart}
        onTouchStart={onTouchDragStart}
        onTouchEndCapture={enableTouchDoubleTap && onTouchDoubleTap ? onDragTouchEnd : undefined}
        {...srtMenu.surfaceProps}
      />
      {children}
      {srtMenu.menuPortal}
      <div
        className="pip-resize-handle"
        onMouseDown={onResizeStart}
        onTouchStart={onTouchResizeStart}
      >
        <ResizeIcon />
      </div>
    </div>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

function ResizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M9 1L1 9M9 5L5 9M9 9H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
