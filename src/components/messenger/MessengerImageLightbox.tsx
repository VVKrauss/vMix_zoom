import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, XCloseIcon } from '../icons'
import { LIGHTBOX_SWIPE_CLOSE_PX } from '../../lib/messengerDashboardUtils'

export type MessengerImageLightboxProps = {
  open: boolean
  /** Полноразмерные URL (уже с подписью). */
  urls: string[]
  initialIndex?: number
  onClose: () => void
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

export function MessengerImageLightbox({ open, urls, initialIndex = 0, onClose }: MessengerImageLightboxProps) {
  const list = urls.filter((u) => u.trim())
  const [index, setIndex] = useState(0)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const swipeRef = useRef<{
    pointerId: number | null
    x0: number
    y0: number
    active: boolean
  }>({ pointerId: null, x0: 0, y0: 0, active: false })

  useEffect(() => {
    if (!open) return
    setIndex(mod(initialIndex, Math.max(1, list.length)))
  }, [open, initialIndex, list.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (list.length <= 1) return
      if (e.key === 'ArrowLeft') setIndex((i) => mod(i - 1, list.length))
      if (e.key === 'ArrowRight') setIndex((i) => mod(i + 1, list.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, list.length])

  const handleSwipeEnd = useCallback(
    (dx: number, dy: number) => {
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const thr = LIGHTBOX_SWIPE_CLOSE_PX
      if (ax < thr && ay < thr) return

      if (list.length > 1) {
        if (ax > ay && ax >= thr) {
          if (dx > 0) setIndex((i) => mod(i - 1, list.length))
          else setIndex((i) => mod(i + 1, list.length))
          return
        }
        if (ay > ax && ay >= thr) {
          onClose()
          return
        }
        return
      }

      // Одно фото: закрытие только вертикальным свайпом
      if (ay >= ax && ay >= thr) onClose()
    },
    [list.length, onClose],
  )

  useLayoutEffect(() => {
    if (!open) return
    const el = frameRef.current
    if (!el) return
    const start = { x: 0, y: 0, tracking: false }
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
      handleSwipeEnd(t.clientX - start.x, t.clientY - start.y)
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
  }, [open, handleSwipeEnd, list])

  if (!open || list.length === 0) return null

  const currentUrl = list[index] ?? list[0]

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
      {list.length > 1 ? (
        <button
          type="button"
          className="messenger-image-lightbox__nav messenger-image-lightbox__nav--prev"
          aria-label="Предыдущее фото"
          title="Предыдущее"
          onClick={(e) => {
            e.stopPropagation()
            setIndex((i) => mod(i - 1, list.length))
          }}
        >
          <ChevronLeftIcon />
        </button>
      ) : null}
      {list.length > 1 ? (
        <button
          type="button"
          className="messenger-image-lightbox__nav messenger-image-lightbox__nav--next"
          aria-label="Следующее фото"
          title="Следующее"
          onClick={(e) => {
            e.stopPropagation()
            setIndex((i) => mod(i + 1, list.length))
          }}
        >
          <ChevronRightIcon />
        </button>
      ) : null}
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
          handleSwipeEnd(e.clientX - s.x0, e.clientY - s.y0)
        }}
        onPointerCancel={() => {
          swipeRef.current.active = false
        }}
      >
        <img key={currentUrl} src={currentUrl} className="messenger-image-lightbox__img" alt="" draggable={false} />
        {list.length > 1 ? (
          <div className="messenger-image-lightbox__counter" aria-hidden>
            {index + 1} / {list.length}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
