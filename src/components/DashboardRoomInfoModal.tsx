import { useEffect, useState } from 'react'
import {
  listRoomChatMembersForUser,
  type RoomChatConversationSummary,
  type RoomChatMemberRow,
} from '../lib/chatArchive'

export function DashboardRoomInfoModal({
  open,
  conversationId,
  summary,
  userId,
  onClose,
  onOpenChat,
}: {
  open: boolean
  conversationId: string | null
  summary: RoomChatConversationSummary | null
  userId: string
  onClose: () => void
  onOpenChat: () => void
}) {
  const [members, setMembers] = useState<RoomChatMemberRow[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !conversationId?.trim()) {
      setMembers(null)
      setLoadErr(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadErr(null)
    void listRoomChatMembersForUser(conversationId.trim(), userId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (res.error) {
        setLoadErr(res.error)
        setMembers(null)
        return
      }
      setMembers(res.data ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [open, conversationId, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !summary) return null

  const chatEnabled = summary.messageCount > 0

  return (
    <div className="confirm-dialog-root">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="confirm-dialog dashboard-profile-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-room-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dashboard-room-info-title" className="confirm-dialog__title">
          Комната
        </h2>
        <div className="dashboard-profile-modal__scroll">
          <p className="dashboard-room-info-modal__title">{summary.title}</p>
          {summary.roomSlug ? (
            <p className="dashboard-field__hint">
              Ссылка: <code className="admin-dashboard-code">/r/{summary.roomSlug}</code>
            </p>
          ) : null}
          <p className="dashboard-field__hint">
            Сообщений в чате: {summary.messageCount}
            {summary.closedAt ? ' · комната закрыта' : ' · комната открыта'}
          </p>
          {loading ? <p className="dashboard-field__hint">Загрузка участников…</p> : null}
          {loadErr ? <p className="join-error">{loadErr}</p> : null}
          {!loading && !loadErr && members && members.length > 0 ? (
            <div>
              <p className="dashboard-field__label" style={{ marginTop: 12 }}>
                Участники чата
              </p>
              <ul className="dashboard-room-info-modal__members">
                {members.map((m) => (
                  <li key={m.userId} className="dashboard-room-info-modal__member">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="dashboard-room-info-modal__av" />
                    ) : (
                      <span className="dashboard-room-info-modal__av dashboard-room-info-modal__av--ph">
                        {m.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span>{m.displayName}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="dashboard-profile-modal__foot dashboard-room-info-modal__foot">
          {chatEnabled ? (
            <button type="button" className="confirm-dialog__btn" onClick={onOpenChat}>
              Открыть чат
            </button>
          ) : (
            <p className="dashboard-field__hint" style={{ margin: 0 }}>
              Сообщений не было — переписка недоступна.
            </p>
          )}
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
