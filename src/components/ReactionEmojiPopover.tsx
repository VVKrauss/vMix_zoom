import { useEffect, useRef, useState } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { twemojiSvgUrl } from '../lib/twemojiUrl'

export function ReactionEmojiPopover({
  onClose,
  onPick,
  title = 'Реакции',
  emojis,
}: {
  onClose: () => void
  onPick: (emoji: string) => void
  title?: string
  emojis?: readonly string[]
}) {
  const grid = emojis ?? REACTION_EMOJI_WHITELIST
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
      <div className="device-popover__title">{title}</div>
      <div className={`reaction-emoji-grid${grid.length > 16 ? ' reaction-emoji-grid--scroll' : ''}`}>
        {grid.map((emoji) => (
          <ReactionEmojiGridButton key={emoji} emoji={emoji} onPick={() => onPick(emoji)} />
        ))}
      </div>
    </div>
  )
}

function ReactionEmojiGridButton({ emoji, onPick }: { emoji: string; onPick: () => void }) {
  const [imgBroken, setImgBroken] = useState(false)
  const src = twemojiSvgUrl(emoji)
  return (
    <button type="button" className="reaction-emoji-btn" title={emoji} aria-label={emoji} onClick={onPick}>
      {src && !imgBroken ? (
        <img
          src={src}
          alt=""
          className="reaction-emoji-btn__twemoji"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setImgBroken(true)}
        />
      ) : (
        <span className="reaction-emoji-btn__fallback" aria-hidden>
          {emoji}
        </span>
      )}
    </button>
  )
}
