import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { PillToggle } from './PillToggle'

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
  showSourceLine,
  onShowSourceLineChange,
  onSend,
  sending,
}: {
  open: boolean
  onClose: () => void
  items: ForwardDmPickItem[]
  excludeConversationId?: string | null
  comment: string
  onCommentChange: (v: string) => void
  showSourceLine: boolean
  onShowSourceLineChange: (v: boolean) => void
  onSend: (conversationIds: string[]) => void
  sending: boolean
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(new Set())
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (excludeConversationId && i.id === excludeConversationId.trim()) return false
      if (!q) return true
      const t = (i.title ?? '').toLowerCase()
      return t.includes(q)
    })
  }, [excludeConversationId, items, query])

  const selectedIds = useMemo(() => [...selected.values()], [selected])
  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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
          Переслать
        </h2>
        <input
          className="dashboard-messenger__input messenger-forward-modal__search"
          value={query}
          disabled={sending}
          placeholder="Поиск"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Поиск по чатам"
        />
        <div className="messenger-forward-modal__list" role="list" aria-label="Выбор диалогов">
          {filtered.length === 0 ? (
            <p className="messenger-settings-modal__hint">Нет других личных чатов.</p>
          ) : (
            filtered.map((it) => (
              <label
                key={it.id}
                role="listitem"
                className="messenger-forward-modal__row"
                aria-disabled={sending}
              >
                <input
                  type="checkbox"
                  className="messenger-forward-modal__pick"
                  checked={selected.has(it.id)}
                  disabled={sending}
                  onChange={() => toggleSelected(it.id)}
                  aria-label={`Выбрать: ${it.title}`}
                />
                <span className="messenger-forward-modal__avatar" aria-hidden>
                  {it.avatarUrl ? <img src={it.avatarUrl} alt="" /> : <span>{(it.title || '?').trim().slice(0, 1).toUpperCase()}</span>}
                </span>
                <span className="messenger-forward-modal__title">{it.title}</span>
              </label>
            ))
          )}
        </div>
        <div className="messenger-forward-modal__bottom">
          <div className="messenger-forward-modal__toggle-row">
            <span className="messenger-forward-modal__toggle-label">Добавлять «Переслано из»</span>
            <PillToggle
              checked={showSourceLine}
              onCheckedChange={onShowSourceLineChange}
              ariaLabel="Добавлять «Переслано из»"
              compact
              disabled={sending}
            />
          </div>
          <textarea
            id="messenger-forward-comment"
            className="dashboard-messenger__input messenger-forward-modal__comment"
            rows={2}
            placeholder="Комментарий (необязательно)"
            value={comment}
            disabled={sending}
            onChange={(e) => onCommentChange(e.target.value)}
          />
        </div>
        <div className="messenger-settings-modal__actions">
          <button
            type="button"
            className="dashboard-topbar__action dashboard-topbar__action--primary"
            disabled={sending || selectedIds.length === 0}
            onClick={() => onSend(selectedIds)}
          >
            Переслать
          </button>
          <button type="button" className="dashboard-topbar__action" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
