import { useEffect, useRef, ReactNode } from 'react'

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

export function DraggablePip({ children, pos, size, onPosChange, onSizeChange, lockAspect }: Props) {
  const dragState   = useRef({ active: false, ox: 0, oy: 0 })
  const resizeState = useRef({ active: false, ox: 0, oy: 0, ow: 0, oh: 0 })

  // Correct height when lockAspect changes (e.g. user switches 16:9 / 4:3 / free)
  useEffect(() => {
    if (lockAspect) {
      onSizeChange({ w: size.w, h: Math.round(size.w / lockAspect) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockAspect])

  // ── Drag ───────────────────────────────────────────────────────────────────
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { active: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y }
  }

  // ── Resize ─────────────────────────────────────────────────────────────────
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = { active: true, ox: e.clientX, oy: e.clientY, ow: size.w, oh: size.h }
  }

  // ── Global mouse events ────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragState.current.active) {
        const x = clamp(e.clientX - dragState.current.ox, 0, window.innerWidth  - size.w)
        const y = clamp(e.clientY - dragState.current.oy, 0, window.innerHeight - size.h - 72)
        onPosChange({ x, y })
      }
      if (resizeState.current.active) {
        const dx = e.clientX - resizeState.current.ox
        const w  = Math.max(MIN_W, resizeState.current.ow + dx)
        const h  = lockAspect
          ? Math.round(w / lockAspect)
          : Math.max(Math.round(MIN_W * 0.5), resizeState.current.oh + (e.clientY - resizeState.current.oy))
        onSizeChange({ w, h })
      }
    }
    const onUp = () => {
      dragState.current.active   = false
      resizeState.current.active = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [size.w, size.h, pos.x, pos.y, lockAspect, onPosChange, onSizeChange])

  return (
    <div
      className="pip-float"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div className="pip-drag-handle" onMouseDown={onDragStart} />
      {children}
      <div className="pip-resize-handle" onMouseDown={onResizeStart}>
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
