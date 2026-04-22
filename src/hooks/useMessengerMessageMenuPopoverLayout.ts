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
      const vv = window.visualViewport
      const ox = vv?.offsetLeft ?? 0
      const oy = vv?.offsetTop ?? 0
      const vw = vv?.width ?? window.innerWidth
      const vh = vv?.height ?? window.innerHeight
      let left =
        messageMenu.mode === 'kebab' ? messageMenu.anchorX - rect.width : messageMenu.anchorX
      let top =
        messageMenu.mode === 'kebab' ? messageMenu.anchorY - rect.height - 6 : messageMenu.anchorY
      if (left + rect.width > ox + vw - pad) left = ox + vw - pad - rect.width
      if (left < ox + pad) left = ox + pad
      if (top + rect.height > oy + vh - pad) top = oy + vh - pad - rect.height
      if (top < oy + pad) top = oy + pad
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.visibility = 'visible'
    }
    el.style.visibility = 'hidden'
    place()
  }, [messageMenu])
}
