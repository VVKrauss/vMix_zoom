import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { type RoomChatConversationSummary, listRoomChatConversationsForUser } from '../lib/chatArchive'
import { DashboardTopbar } from './DashboardTopbar'

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function DashboardChatsPage() {
  const { signOut, user } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<RoomChatConversationSummary[]>([])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!user?.id) {
        if (active) {
          setItems([])
          setLoading(false)
        }
        return
      }
      setLoading(true)
      setError(null)
      const result = await listRoomChatConversationsForUser(user.id)
      if (!active) return
      if (result.error) {
        setError(result.error)
        setItems([])
      } else {
        setItems(result.data ?? [])
      }
      setLoading(false)
    }
    void run()
    return () => {
      active = false
    }
  }, [user?.id])

  return (
    <div className="dashboard-page">
      <DashboardTopbar canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()} active="chats" />

      <div className="dashboard-body">
        <div className="dashboard-content dashboard-content--cabinet">
          <section className="dashboard-section">
            <h2 className="dashboard-section__title">Чаты комнат</h2>
            <p className="dashboard-section__hint">
              Здесь сохраняются архивы комнатных чатов. Видны только беседы тех комнат, в которых вы были участником под своим аккаунтом.
            </p>

            {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
            {!loading && error ? <p className="join-error">{error}</p> : null}
            {!loading && !error && items.length === 0 ? (
              <div className="dashboard-chats-empty">
                После завершения вашей первой комнаты здесь появится архив переписки.
              </div>
            ) : null}

            {!loading && !error && items.length > 0 ? (
              <div className="dashboard-chat-list">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    to={`/dashboard/chats/${encodeURIComponent(item.id)}`}
                    className="dashboard-chat-row"
                  >
                    <div className="dashboard-chat-row__main">
                      <div className="dashboard-chat-row__titleline">
                        <span className="dashboard-chat-row__title">{item.title}</span>
                        <span className={`dashboard-badge ${item.closedAt ? 'dashboard-badge--pending' : 'dashboard-badge--active'}`}>
                          {item.closedAt ? 'Завершён' : 'Активен'}
                        </span>
                      </div>
                      <div className="dashboard-chat-row__meta">
                        <span>Комната: {item.roomSlug ?? '—'}</span>
                        <span>Сообщений: {item.messageCount}</span>
                        <span>Последняя активность: {formatDateTime(item.lastMessageAt ?? item.createdAt)}</span>
                      </div>
                      <div className="dashboard-chat-row__preview">
                        {item.lastMessagePreview?.trim() || 'Сообщений пока нет'}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
