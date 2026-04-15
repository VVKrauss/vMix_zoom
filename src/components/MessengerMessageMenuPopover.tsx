import { useEffect, useRef } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import type { ReactionEmoji } from '../types/roomComms'

export function MessengerMessageMenuPopover({
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onDelete,
  onReply,
  onPickReaction,
  showAddPin,
  pinActive,
  pinBusy,
  onTogglePin,
  hideReply,
}: {
  canEdit: boolean
  canDelete: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onReply: () => void
  onPickReaction: (emoji: ReactionEmoji) => void
  /** Скрыть пункт «Ответить» (например, комментарии к посту канала). */
  hideReply?: boolean
  showAddPin?: boolean
  pinActive?: boolean
  pinBusy?: boolean
  onTogglePin?: () => void
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
    <div className="messenger-msg-menu device-popover" ref={ref} role="menu">
      {canEdit ? (
        <button type="button" className="messenger-msg-menu__item" role="menuitem" onClick={onEdit}>
          Редактировать
        </button>
      ) : null}
      {canDelete ? (
        <button type="button" className="messenger-msg-menu__item" role="menuitem" onClick={onDelete}>
          Удалить
        </button>
      ) : null}
      <div className="messenger-msg-menu__emoji-row" role="group" aria-label="Реакции">
        {REACTION_EMOJI_WHITELIST.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="messenger-msg-menu__emoji"
            title={emoji}
            aria-label={`Реакция ${emoji}`}
            onClick={() => onPickReaction(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      {!hideReply ? (
        <button type="button" className="messenger-msg-menu__item" role="menuitem" onClick={onReply}>
          Ответить
        </button>
      ) : null}
      {showAddPin && onTogglePin ? (
        <button
          type="button"
          className="messenger-msg-menu__item"
          role="menuitem"
          disabled={pinBusy}
          onClick={onTogglePin}
        >
          {pinActive ? 'Убрать из контактов' : 'Добавить в контакты'}
        </button>
      ) : null}
    </div>
  )
}
