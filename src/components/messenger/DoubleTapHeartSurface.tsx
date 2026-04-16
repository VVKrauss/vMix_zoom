import { useCallback, type ReactNode } from 'react'
import { useTouchDoubleTap } from '../../hooks/useTouchDoubleTap'

/** Двойной тап (моб.) / двойной клик (десктоп): лайк на пузырь, без интерактивных дочерних элементов. */
export function DoubleTapHeartSurface({
  enabled,
  isMobileViewport,
  onHeart,
  children,
  className,
}: {
  enabled: boolean
  isMobileViewport: boolean
  onHeart: () => void
  children: ReactNode
  className?: string
}) {
  const cb = useCallback(() => {
    onHeart()
  }, [onHeart])
  const touch = useTouchDoubleTap(cb, Boolean(enabled && isMobileViewport))
  return (
    <div
      className={className}
      onTouchStart={touch.onTouchStart}
      onTouchMove={touch.onTouchMove}
      onTouchEndCapture={touch.onTouchEndCapture}
      onDoubleClick={(e) => {
        if (!enabled) return
        if (
          (e.target as HTMLElement).closest(
            'button, a, .messenger-message-img-trigger, .dashboard-messenger__msg-more, .dashboard-messenger__channel-post-more',
          )
        ) {
          return
        }
        e.preventDefault()
        if (isMobileViewport) return
        onHeart()
      }}
    >
      {children}
    </div>
  )
}
