import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  type RoomChatArchiveMessage,
  type RoomChatConversationSummary,
  getRoomChatConversationForUser,
  listRoomChatMessagesForUser,
} from '../lib/chatArchive'
import { DashboardTopbar } from './DashboardTopbar'

function formatDateTime(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function DashboardChatViewPage() {
  const { conversationId: rawConversationId = '' } = useParams<{ conversationId: string }>()
  const conversationId = useMemo(() => rawConversationId.trim(), [rawConversationId])
  const { signOut, user } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<RoomChatConversationSummary | null>(null)
  const [messages, setMessages] = useState<RoomChatArchiveMessage[]>([])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!conversationId || !user?.id) {
        if (active) {
          setConversation(null)
          setMessages([])
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)

      const [conversationRes, messagesRes] = await Promise.all([
        getRoomChatConversationForUser(conversationId, user.id),
        listRoomChatMessagesForUser(conversationId, user.id),
      ])

      if (!active) return

      if (conversationRes.error) {
        setError(conversationRes.error)
        setConversation(null)
        setMessages([])
      } else if (!conversationRes.data) {
        setError('Чат не найден или у вас нет к нему доступа.')
        setConversation(null)
        setMessages([])
      } else if (messagesRes.error) {
        setError(messagesRes.error)
        setConversation(conversationRes.data)
        setMessages([])
      } else {
        setConversation(conversationRes.data)
        setMessages(messagesRes.data ?? [])
      }

      setLoading(false)
    }

    void run()
    return () => {
      active = false
    }
  }, [conversationId, user?.id])

  return (
    <div className="dashboard-page">
      <DashboardTopbar canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()} active="chats" />

      <div className="dashboard-body">
        <div className="dashboard-content dashboard-content--cabinet">
          <section className="dashboard-section">
            <div className="dashboard-chat-view__head">
              <div>
                <h2 className="dashboard-section__title">{conversation?.title ?? 'Архив чата'}</h2>
                <p className="dashboard-section__hint">
                  <Link to="/dashboard/chats" className="dashboard-chat-view__back">
                    ← Назад к списку чатов
                  </Link>
                </p>
              </div>
              {conversation ? (
                <div className="dashboard-chat-view__summary">
                  <span>Комната: {conversation.roomSlug ?? '—'}</span>
                  <span>{conversation.closedAt ? 'Завершён' : 'Активен'}</span>
                  <span>Сообщений: {conversation.messageCount}</span>
                </div>
              ) : null}
            </div>

            {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
            {!loading && error ? <p className="join-error">{error}</p> : null}

            {!loading && !error ? (
              <div className="dashboard-chat-thread">
                {messages.length === 0 ? (
                  <div className="dashboard-chats-empty">В этом архиве пока нет сообщений.</div>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className={`dashboard-chat-message${
                        message.kind === 'reaction'
                          ? ' dashboard-chat-message--reaction'
                          : message.kind === 'system'
                            ? ' dashboard-chat-message--system'
                            : ''
                      }`}
                    >
                      <div className="dashboard-chat-message__meta">
                        <span className="dashboard-chat-message__author">{message.senderNameSnapshot}</span>
                        <time className="dashboard-chat-message__time" dateTime={message.createdAt}>
                          {formatDateTime(message.createdAt)}
                        </time>
                      </div>
                      <div className="dashboard-chat-message__body">{message.body}</div>
                    </article>
                  ))
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
