import { createPortal } from 'react-dom'
import type { MutableRefObject, ReactNode, ReactPortal } from 'react'

/** Портал обёртки для меню действий над сообщением (fixed + ref для позиционирования). */
export function MessengerDmMessageMenuPortal(props: {
  open: boolean
  msgMenuWrapRef: MutableRefObject<HTMLDivElement | null>
  children: ReactNode
}): ReactPortal | null {
  const { open, msgMenuWrapRef, children } = props
  if (!open) return null
  return createPortal(
    <div
      ref={msgMenuWrapRef}
      className="messenger-msg-menu-wrap"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 26500,
        visibility: 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
