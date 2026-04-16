import { useCallback } from 'react'
import { createPortal } from 'react-dom'

export type ForwardDmPickItem = {
  id: string
  title: string
  avatarUrl: string | null
}

export function MessengerForwardToDmModal({
  open,
  onClose,
  items,
  excludeConversationId,
  comment,
  onCommentChange,
  onSend,
  sending,
}: {
  open: boolean
  onClose: () => void
  items: ForwardDmPickItem[]
  excludeConversationId?: string | null
  comment: string
  onCommentChange: (v: string) => void
  onSend: (conversationId: string) => void
  sending: boolean
}) {
  const filtered = items.filter((i) => !excludeConversationId || i.id !== excludeConversationId.trim())

  const onBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose],
  )

  if (!open) return null

  return createPortal(
    <div className="messenger-forward-modal-root" role="dialog" aria-modal="true" aria-labelledby="messenger-forward-title">
      <button type="button" className="messenger-settings-modal-backdrop" aria-label="Закрыть" onClick={onBackdrop} />
      <div className="messenger-forward-modal">
        <h2 id="messenger-forward-title" className="messenger-settings-modal__title">
          Переслать в личный чат
        </h2>
        <p className="messenger-settings-modal__hint">Выберите диалог. При необходимости добавьте комментарий — он будет выше пересланного текста.</p>
        <label className="messenger-settings-modal__label" htmlFor="messenger-forward-comment">
          Комментарий (необязательно)
        </label>
        <textarea
          id="messenger-forward-comment"
          className="dashboard-messenger__input"
          rows={2}
          value={comment}
          disabled={sending}
          onChange={(e) => onCommentChange(e.target.value)}
        />
        <div className="messenger-forward-modal__list" role="list">
          {filtered.length === 0 ? (
            <p className="messenger-settings-modal__hint">Нет других личных чатов.</p>
          ) : (
            filtered.map((it) => (
              <button
                key={it.id}
                type="button"
                role="listitem"
                className="messenger-forward-modal__row"
                disabled={sending}
                onClick={() => onSend(it.id)}
              >
                <span className="messenger-forward-modal__avatar" aria-hidden>
                  {it.avatarUrl ? <img src={it.avatarUrl} alt="" /> : <span>{(it.title || '?').trim().slice(0, 1).toUpperCase()}</span>}
                </span>
                <span className="messenger-forward-modal__title">{it.title}</span>
              </button>
            ))
          )}
        </div>
        <div className="messenger-settings-modal__actions">
          <button type="button" className="dashboard-topbar__action" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
