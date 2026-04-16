import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { XCloseIcon } from '../icons'
import { LIGHTBOX_SWIPE_CLOSE_PX } from '../../lib/messengerDashboardUtils'

export type MessengerImageLightboxProps = {
  open: boolean
  imageUrl: string
  onClose: () => void
}

export function MessengerImageLightbox({ open, imageUrl, onClose }: MessengerImageLightboxProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const swipeRef = useRef<{
    pointerId: number | null
    x0: number
    y0: number
    active: boolean
  }>({ pointerId: null, x0: 0, y0: 0, active: false })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) return
    const el = frameRef.current
    if (!el) return
    const start = { x: 0, y: 0, tracking: false }
    const closeIfSwipe = (dx: number, dy: number) => {
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const thr = LIGHTBOX_SWIPE_CLOSE_PX
      if (ax < thr && ay < thr) return
      if (ay >= ax && ay >= thr) {
        onClose()
        return
      }
      if (ax > ay && ax >= thr) {
        onClose()
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      start.tracking = true
      start.x = e.touches[0].clientX
      start.y = e.touches[0].clientY
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!start.tracking || e.changedTouches.length !== 1) return
      start.tracking = false
      const t = e.changedTouches[0]
      closeIfSwipe(t.clientX - start.x, t.clientY - start.y)
    }
    const onTouchCancel = () => {
      start.tracking = false
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [open, imageUrl, onClose])

  if (!open || !imageUrl.trim()) return null

  return createPortal(
    <div
      className="messenger-image-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
      onClick={() => onClose()}
    >
      <button
        type="button"
        className="messenger-image-lightbox__close"
        aria-label="Закрыть"
        title="Закрыть"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        <XCloseIcon />
      </button>
      <div
        ref={frameRef}
        className="messenger-image-lightbox__frame"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          swipeRef.current = {
            pointerId: e.pointerId,
            x0: e.clientX,
            y0: e.clientY,
            active: true,
          }
        }}
        onPointerUp={(e) => {
          const s = swipeRef.current
          if (!s.active || e.pointerId !== s.pointerId) return
          s.active = false
          const dx = e.clientX - s.x0
          const dy = e.clientY - s.y0
          const ax = Math.abs(dx)
          const ay = Math.abs(dy)
          const thr = LIGHTBOX_SWIPE_CLOSE_PX
          if (ax < thr && ay < thr) return
          if (ay >= ax && ay >= thr) {
            onClose()
            return
          }
          if (ax > ay && ax >= thr) {
            onClose()
          }
        }}
        onPointerCancel={() => {
          swipeRef.current.active = false
        }}
      >
        <img src={imageUrl} className="messenger-image-lightbox__img" alt="" draggable={false} />
      </div>
    </div>,
    document.body,
  )
}
