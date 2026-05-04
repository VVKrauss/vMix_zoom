import { useEffect, useRef } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import type { ReactionEmoji } from '../types/roomComms'
import type { DmOutgoingReceiptLevel } from '../lib/messenger'
import { DmOutgoingReceiptGlyph } from './messenger/DmOutgoingReceiptGlyph'
import { FiRrIcon } from './icons'

export function MessengerMessageMenuPopover({
  canEdit,
  canDelete,
  canCopy,
  canBookmark,
  canSave,
  dmOutgoingReceipt,
  timestampLabel,
  onClose,
  onEdit,
  onDelete,
  onCopy,
  onBookmark,
  onSave,
  onReply,
  onPickReaction,
  onForward,
  showAddPin,
  pinActive,
  pinBusy,
  onTogglePin,
  hideReply,
  outsidePointerIgnoreInside,
}: {
  canEdit: boolean
  canDelete: boolean
  /** Скопировать текст сообщения в буфер обмена. */
  canCopy?: boolean
  /** Закладки: показать/разрешить пункт «В закладки». */
  canBookmark?: boolean
  /** Сохранённое: показать/разрешить пункт «Сохранить». */
  canSave?: boolean
  /** ЛС: легенда статуса исходящего (кольцо/полукруг/круг) — только информационная строка. */
  dmOutgoingReceipt?: { level: DmOutgoingReceiptLevel; messageId: string } | null
  /** Дата/время сообщения (показывается внизу меню). */
  timestampLabel?: string | null
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onCopy?: () => void | Promise<void>
  onBookmark?: () => void | Promise<void>
  onSave?: () => void | Promise<void>
  onReply: () => void
  onPickReaction: (emoji: ReactionEmoji) => void
  /** Переслать в личный чат (канал/группа/ЛС). */
  onForward?: () => void
  /** Скрыть пункт «Ответить» (например, комментарии к посту канала). */
  hideReply?: boolean
  showAddPin?: boolean
  pinActive?: boolean
  pinBusy?: boolean
  onTogglePin?: () => void
  /** Пузырь/строка сообщения: не закрывать меню по клику внутри (long-press + отпускание). */
  outsidePointerIgnoreInside?: HTMLElement | null
}) {
  const ref = useRef<HTMLDivElement>(null)

  const receiptLabel =
    dmOutgoingReceipt?.level === 'pending'
      ? 'Отправка'
      : dmOutgoingReceipt?.level === 'read'
        ? 'Прочитано'
        : dmOutgoingReceipt?.level === 'delivered'
          ? 'Доставлено'
          : dmOutgoingReceipt?.level === 'sent'
            ? 'Отправлено'
            : null

  const showTopRow = Boolean((canBookmark && onBookmark) || (canSave && onSave))
  const showReply = !hideReply
  const showCopy = Boolean(canCopy && onCopy)
  const showForward = Boolean(onForward)
  const showBottomRow = showReply || showCopy || showForward || canEdit || canDelete

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0]
          ? (e.touches[0]!.target as EventTarget)
          : (e as MouseEvent).target
      if (
        shouldClosePopoverOnOutsidePointer(ref.current, target, {
          ignoreInside: outsidePointerIgnoreInside ?? null,
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
  }, [onClose, outsidePointerIgnoreInside])

  return (
    <div className="messenger-msg-menu device-popover" ref={ref} role="menu">
      {dmOutgoingReceipt && receiptLabel ? (
        <div className="messenger-msg-menu__legend" role="presentation" aria-label="Статус сообщения">
          <span className="messenger-msg-menu__legend-glyph" aria-hidden>
            <DmOutgoingReceiptGlyph level={dmOutgoingReceipt.level} messageId={dmOutgoingReceipt.messageId} />
          </span>
          <span className="messenger-msg-menu__legend-text">{receiptLabel}</span>
        </div>
      ) : null}
      {showTopRow ? (
        <div className="messenger-msg-menu__top-actions" role="group" aria-label="Закладки и сохранение">
          {canBookmark && onBookmark ? (
            <button
              type="button"
              className="messenger-msg-menu__icon-btn"
              role="menuitem"
              title="В закладки"
              aria-label="В закладки"
              onClick={() => {
                void Promise.resolve(onBookmark()).finally(() => onClose())
              }}
            >
              <FiRrIcon name="bookmark" />
            </button>
          ) : null}
          {canSave && onSave ? (
            <button
              type="button"
              className="messenger-msg-menu__icon-btn"
              role="menuitem"
              title="Сохранить"
              aria-label="Сохранить"
              onClick={() => {
                void Promise.resolve(onSave()).finally(() => onClose())
              }}
            >
              <FiRrIcon name="inbox-in" />
            </button>
          ) : null}
        </div>
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
      {showBottomRow ? (
        <div className="messenger-msg-menu__actions-row" role="group" aria-label="Действия с сообщением">
          {showReply ? (
            <button
              type="button"
              className="messenger-msg-menu__icon-btn"
              role="menuitem"
              title="Ответить"
              aria-label="Ответить"
              onClick={onReply}
            >
              <FiRrIcon name="comment-quote" />
            </button>
          ) : null}
          {showCopy ? (
            <button
              type="button"
              className="messenger-msg-menu__icon-btn"
              role="menuitem"
              title="Скопировать"
              aria-label="Скопировать"
              onClick={() => {
                void Promise.resolve(onCopy!()).finally(() => onClose())
              }}
            >
              <FiRrIcon name="copy" />
            </button>
          ) : null}
          {showForward ? (
            <button
              type="button"
              className="messenger-msg-menu__icon-btn"
              role="menuitem"
              title="Переслать"
              aria-label="Переслать"
              onClick={() => {
                onForward!()
                onClose()
              }}
            >
              <FiRrIcon name="share" />
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              className="messenger-msg-menu__icon-btn"
              role="menuitem"
              title="Редактировать"
              aria-label="Редактировать"
              onClick={onEdit}
            >
              <FiRrIcon name="edit" />
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="messenger-msg-menu__icon-btn messenger-msg-menu__icon-btn--danger"
              role="menuitem"
              title="Удалить"
              aria-label="Удалить"
              onClick={onDelete}
            >
              <FiRrIcon name="trash-xmark" />
            </button>
          ) : null}
        </div>
      ) : null}
      {showAddPin && onTogglePin ? (
        <button
          type="button"
          className="messenger-msg-menu__item messenger-msg-menu__item--pin"
          role="menuitem"
          disabled={pinBusy}
          onClick={onTogglePin}
        >
          <span className="messenger-msg-menu__item-pin-ico" aria-hidden>
            <FiRrIcon name="user-add" />
          </span>
          {pinActive ? 'Убрать из контактов' : 'Добавить в контакты'}
        </button>
      ) : null}
      {timestampLabel?.trim() ? (
        <div className="messenger-msg-menu__time" role="presentation">
          {timestampLabel.trim()}
        </div>
      ) : null}
    </div>
  )
}
