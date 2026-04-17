import { useEffect, useRef } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'

export function MessengerChatListMenuPopover({
  onClose,
  pinned,
  pinDisabled,
  onTogglePin,
  onMarkRead,
  onDeleteChat,
}: {
  onClose: () => void
  pinned: boolean
  /** Уже 3 закрепа и этот чат не в закрепах — нельзя добавить ещё один. */
  pinDisabled: boolean
  onTogglePin: () => void
  onMarkRead: () => void
  /** Удаление чата (тот же сценарий, что в быстром меню по бургеру). */
  onDeleteChat?: () => void
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
    <div className="messenger-chatlist-menu device-popover" ref={ref} role="menu">
      <button
        type="button"
        className="messenger-chatlist-menu__item"
        role="menuitem"
        disabled={pinDisabled && !pinned}
        title={pinDisabled && !pinned ? 'Не больше трёх закреплённых чатов' : undefined}
        onClick={() => {
          onTogglePin()
          onClose()
        }}
      >
        {pinned ? 'Открепить' : 'Закрепить'}
      </button>
      <button
        type="button"
        className="messenger-chatlist-menu__item"
        role="menuitem"
        onClick={() => {
          onMarkRead()
          onClose()
        }}
      >
        Отметить прочитанным
      </button>
      {onDeleteChat ? (
        <button
          type="button"
          className="messenger-chatlist-menu__item messenger-chatlist-menu__item--danger"
          role="menuitem"
          onClick={() => {
            onDeleteChat()
          }}
        >
          Удалить чат…
        </button>
      ) : null}
    </div>
  )
}
