import { useEffect, useRef, useState, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

const MIN_W = 140
const MIN_H = 90

export function DraggablePip({ children }: Props) {
  const [pos, setPos] = useState({ x: -1, y: -1 })   // -1 = not yet placed
  const [size, setSize] = useState({ w: 220, h: 148 })

  const elRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ active: boolean; ox: number; oy: number }>({ active: false, ox: 0, oy: 0 })
  const resizeState = useRef<{ active: boolean; ox: number; oy: number; ow: number; oh: number }>({
    active: false, ox: 0, oy: 0, ow: 0, oh: 0,
  })

  // Place initially in top-right on first render / reset
  useEffect(() => {
    setPos({
      x: window.innerWidth - size.w - 16,
      y: 10,  // top-right
    })
    setSize({ w: 220, h: 148 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Drag ───────────────────────────────────────────────────────────────────

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragState.current = { active: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y }
  }

  // ─── Resize ─────────────────────────────────────────────────────────────────

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizeState.current = { active: true, ox: e.clientX, oy: e.clientY, ow: size.w, oh: size.h }
  }

  // ─── Global mouse events ─────────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragState.current.active) {
        const x = clamp(e.clientX - dragState.current.ox, 0, window.innerWidth - size.w)
        const y = clamp(e.clientY - dragState.current.oy, 0, window.innerHeight - size.h - 72)
        setPos({ x, y })
      }
      if (resizeState.current.active) {
        const dx = e.clientX - resizeState.current.ox
        const dy = e.clientY - resizeState.current.oy
        const w = Math.max(MIN_W, resizeState.current.ow + dx)
        const h = Math.max(MIN_H, resizeState.current.oh + dy)
        setSize({ w, h })
      }
    }

    const onUp = () => {
      dragState.current.active = false
      resizeState.current.active = false
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [size.w, size.h])

  if (pos.x === -1) return null

  return (
    <div
      ref={elRef}
      className="pip-float"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      {/* Drag handle — the card-bar strip at the bottom */}
      <div className="pip-drag-handle" onMouseDown={onDragStart} />

      {children}

      {/* Resize handle — bottom-right corner */}
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
