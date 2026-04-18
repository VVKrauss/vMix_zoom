import { useLayoutEffect, type RefObject } from 'react'
import type { DirectMessage } from '../lib/messenger'

export type MessengerMessageMenuModel = {
  message: DirectMessage
  mode: 'kebab' | 'context'
  anchorX: number
  anchorY: number
} | null

/** Позиционирование поповера меню сообщения (kebab / long-press). */
export function useMessengerMessageMenuPopoverLayout(
  messageMenu: MessengerMessageMenuModel,
  msgMenuWrapRef: RefObject<HTMLDivElement | null>,
): void {
  useLayoutEffect(() => {
    const el = msgMenuWrapRef.current
    if (!el || !messageMenu) return
    const place = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) {
        requestAnimationFrame(place)
        return
      }
      const pad = 10
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left =
        messageMenu.mode === 'kebab' ? messageMenu.anchorX - rect.width : messageMenu.anchorX
      let top =
        messageMenu.mode === 'kebab' ? messageMenu.anchorY - rect.height - 6 : messageMenu.anchorY
      if (left + rect.width > vw - pad) left = vw - pad - rect.width
      if (left < pad) left = pad
      if (top + rect.height > vh - pad) top = vh - pad - rect.height
      if (top < pad) top = pad
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.visibility = 'visible'
    }
    el.style.visibility = 'hidden'
    place()
  }, [messageMenu])
}
