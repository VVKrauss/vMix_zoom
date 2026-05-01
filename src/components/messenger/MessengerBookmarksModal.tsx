import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import type { MessageBookmarkRow } from '../../lib/messengerBookmarks'
import { listMessageBookmarks, unbookmarkMessage } from '../../lib/messengerBookmarks'
import { FiRrIcon } from '../icons'

function previewLabelForBookmark(row: MessageBookmarkRow): string {
  const body = row.messageBody?.trim() ?? ''
  if (row.messageKind === 'image') return body ? `Фото: ${body}` : 'Фото'
  if (row.messageKind === 'audio') return body ? `Голосовое: ${body}` : 'Голосовое'
  if (row.messageKind === 'system') return body ? body : 'Системное сообщение'
  return body || 'Сообщение'
}

export function MessengerBookmarksModal({
  open,
  conversationId,
  conversationKind,
  onClose,
  onNavigateToMessage,
  onCopyText,
  onToast,
  onDeleted,
}: {
  open: boolean
  conversationId: string
  conversationKind: 'direct' | 'group' | 'channel'
  onClose: () => void
  onNavigateToMessage: (args: { messageId: string; parentMessageId?: string | null }) => void
  onCopyText: (text: string) => Promise<boolean>
  onToast: (args: { tone: 'success' | 'error' | 'info'; message: string; ms?: number }) => void
  onDeleted?: () => void
}) {
  const cid = conversationId.trim()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<MessageBookmarkRow[]>([])
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    if (!cid) return
    setLoading(true)
    setError(null)
    void listMessageBookmarks({ conversationId: cid, limit: 120 }).then((res) => {
      setLoading(false)
      if (res.error) {
        setError(res.error)
        return
      }
      setRows(res.data ?? [])
    })
  }, [open, cid])

  const empty = useMemo(() => !loading && !error && rows.length === 0, [loading, error, rows.length])

  if (!open) return null

  return createPortal(
    <div className="messenger-settings-modal-root" role="dialog" aria-modal="true" aria-label="Закладки">
      <button type="button" className="messenger-settings-modal-backdrop" onClick={onClose} aria-label="Закрыть" />
      <div className="messenger-settings-modal">
        <div className="messenger-settings-modal__head">
          <div className="messenger-settings-modal__title">
            <FiRrIcon name="bookmark" /> Закладки
          </div>
          <button type="button" className="messenger-settings-modal__x" onClick={onClose} aria-label="Закрыть" title="Закрыть">
            <FiRrIcon name="cross" />
          </button>
        </div>

        {loading ? <div className="messenger-settings-modal__busy">Загрузка…</div> : null}
        {error ? <div className="messenger-settings-modal__error">Не удалось загрузить закладки</div> : null}
        {empty ? <div className="messenger-settings-modal__empty">Закладок пока нет</div> : null}

        <div className="messenger-settings-modal__content">
          {rows.map((r) => {
            const label = previewLabelForBookmark(r)
            const parentMessageId =
              conversationKind === 'channel' && r.replyToMessageId?.trim()
                ? r.replyToMessageId.trim()
                : null
            return (
              <div key={r.bookmarkId} className="messenger-settings-modal__row">
                <div className="messenger-settings-modal__row-main">
                  <div className="messenger-settings-modal__row-title">{label}</div>
                  <div className="messenger-settings-modal__row-meta">
                    {new Date(r.messageCreatedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                </div>
                <div className="messenger-settings-modal__row-actions">
                  <button
                    type="button"
                    className="messenger-settings-modal__btn"
                    onClick={() => {
                      onNavigateToMessage({ messageId: r.messageId, parentMessageId })
                      onClose()
                    }}
                  >
                    Перейти
                  </button>
                  <button
                    type="button"
                    className="messenger-settings-modal__btn"
                    onClick={() => {
                      void onCopyText(label).then((ok) => {
                        onToast({
                          tone: ok ? 'success' : 'error',
                          message: ok ? 'Скопировано в буфер обмена' : 'Не удалось скопировать',
                          ms: 2200,
                        })
                      })
                    }}
                  >
                    Скопировать
                  </button>
                  <button
                    type="button"
                    className="messenger-settings-modal__btn messenger-settings-modal__btn--danger"
                    disabled={busyDeleteId === r.messageId}
                    onClick={() => {
                      if (busyDeleteId) return
                      setBusyDeleteId(r.messageId)
                      void unbookmarkMessage(r.messageId)
                        .then((res) => {
                          if (!res.ok) {
                            onToast({ tone: 'error', message: 'Не удалось удалить закладку', ms: 2400 })
                            return
                          }
                          setRows((prev) => prev.filter((x) => x.messageId !== r.messageId))
                          onDeleted?.()
                          onToast({ tone: 'success', message: 'Закладка удалена', ms: 2200 })
                        })
                        .finally(() => setBusyDeleteId(null))
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}

