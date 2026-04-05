import { useEffect, useRef, useCallback, ReactNode } from 'react'

export interface PipPos  { x: number; y: number }
export interface PipSize { w: number; h: number }

interface Props {
  children:      ReactNode
  pos:           PipPos
  size:          PipSize
  onPosChange:   (p: PipPos)  => void
  onSizeChange:  (s: PipSize) => void
  lockAspect?:   number | null
}

const MIN_W = 140

function clientXY(e: MouseEvent | TouchEvent): { cx: number; cy: number } {
  if ('touches' in e) {
    const t = e.touches[0] ?? (e as TouchEvent).changedTouches[0]
    return { cx: t.clientX, cy: t.clientY }
  }
  return { cx: (e as MouseEvent).clientX, cy: (e as MouseEvent).clientY }
}

export function DraggablePip({ children, pos, size, onPosChange, onSizeChange, lockAspect }: Props) {
  const posRef    = useRef(pos)
  const sizeRef   = useRef(size)
  const aspectRef = useRef(lockAspect)
  const cbRef     = useRef({ onPosChange, onSizeChange })

  posRef.current    = pos
  sizeRef.current   = size
  aspectRef.current = lockAspect
  cbRef.current     = { onPosChange, onSizeChange }

  const dragState   = useRef({ active: false, ox: 0, oy: 0 })
  const resizeState = useRef({ active: false, ox: 0, oy: 0, ow: 0, oh: 0 })

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
  }, [])

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
      />
      {children}
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
