import { useEffect, useRef } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'

export function ReactionEmojiPopover({
  onClose,
  onPick,
}: {
  onClose: () => void
  onPick: (emoji: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0]
          ? (e.touches[0]!.target as EventTarget)
          : (e as MouseEvent).target
      if (shouldClosePopoverOnOutsidePointer(ref.current, target)) onClose()
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [onClose])

  return (
    <div className="device-popover device-popover--reaction-pick" ref={ref}>
      <div className="device-popover__title">Реакции</div>
      <div className="reaction-emoji-grid">
        {REACTION_EMOJI_WHITELIST.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-emoji-btn"
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
