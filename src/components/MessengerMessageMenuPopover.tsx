import { useEffect, useRef } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import type { ReactionEmoji } from '../types/roomComms'
import type { DmOutgoingReceiptLevel } from '../lib/messenger'
import { DmOutgoingReceiptGlyph } from './messenger/DmOutgoingReceiptGlyph'

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
      {canEdit ? (
        <button type="button" className="messenger-msg-menu__item" role="menuitem" onClick={onEdit}>
          Редактировать
        </button>
      ) : null}
      {canCopy && onCopy ? (
        <button
          type="button"
          className="messenger-msg-menu__item"
          role="menuitem"
          onClick={() => {
            void Promise.resolve(onCopy()).finally(() => onClose())
          }}
        >
          Скопировать
        </button>
      ) : null}
      {canBookmark && onBookmark ? (
        <button
          type="button"
          className="messenger-msg-menu__item"
          role="menuitem"
          onClick={() => {
            void Promise.resolve(onBookmark()).finally(() => onClose())
          }}
        >
          В закладки
        </button>
      ) : null}
      {canSave && onSave ? (
        <button
          type="button"
          className="messenger-msg-menu__item"
          role="menuitem"
          onClick={() => {
            void Promise.resolve(onSave()).finally(() => onClose())
          }}
        >
          Сохранить
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
      {onForward ? (
        <button
          type="button"
          className="messenger-msg-menu__item"
          role="menuitem"
          onClick={() => {
            onForward()
            onClose()
          }}
        >
          Переслать
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
      {timestampLabel?.trim() ? (
        <div className="messenger-msg-menu__time" role="presentation">
          {timestampLabel.trim()}
        </div>
      ) : null}
    </div>
  )
}
