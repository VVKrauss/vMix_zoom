import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'
import { shouldClosePopoverOnOutsidePointer } from '../../utils/popoverOutsideClick'

type FixedPos = { right: number; bottom: number }

function readAnchorFixedPos(anchor: HTMLElement): FixedPos {
  const r = anchor.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const vh = window.innerHeight
  return {
    right: vw - r.right,
    bottom: vh - r.top + 6,
  }
}

/**
 * Сетка эмодзи для композера: рендер в `document.body`, позиция по правому краю якоря (`.composer-tools`), над полем ввода.
 * Так попап не попадает под overflow/stacking контейнеров композера.
 */
export function ComposerEmojiPopoverPortal(props: {
  open: boolean
  anchorRef: MutableRefObject<HTMLElement | null>
  title?: string
  emojis: readonly string[]
  onClose: () => void
  onPick: (emoji: string) => void
}) {
  const { open, anchorRef, title = 'Эмодзи', emojis, onClose, onPick } = props
  const portalRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<FixedPos | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const anchor = anchorRef.current
    if (!anchor) {
      setPos(null)
      return
    }
    const sync = () => {
      const el = anchorRef.current
      if (!el) return
      setPos(readAnchorFixedPos(el))
    }
    sync()
    const raf = requestAnimationFrame(sync)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    const vv = window.visualViewport
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0] ? (e.touches[0]!.target as EventTarget) : (e as MouseEvent).target
      if (
        shouldClosePopoverOnOutsidePointer(anchorRef.current, target, {
          ignoreInside: portalRef.current,
        })
      ) {
        onClose()
      }
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [open, onClose, anchorRef])

  if (!open || pos === null) return null

  return createPortal(
    <div
      ref={portalRef}
      className="dashboard-messenger__composer-emoji-pop dashboard-messenger__composer-emoji-pop--portal"
      style={{
        position: 'fixed',
        right: pos.right,
        bottom: pos.bottom,
      }}
    >
      <ReactionEmojiPopover title={title} emojis={emojis} onClose={onClose} onPick={onPick} />
    </div>,
    document.body,
  )
}
