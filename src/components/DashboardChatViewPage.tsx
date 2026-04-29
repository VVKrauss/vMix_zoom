import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  type RoomChatArchiveMessage,
  type RoomChatConversationSummary,
  getRoomChatConversationForUser,
  listRoomChatMessagesForUser,
} from '../lib/chatArchive'
import { ensureDirectConversationWithUser } from '../lib/messenger'
import { getContactStatuses, setContactPin, type ContactStatus } from '../lib/socialGraph'
import { DashboardShell } from './DashboardShell'
import { MessengerMessageBody } from './MessengerMessageBody'
import { ChatBubbleIcon, StarIcon } from './icons'

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
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<RoomChatConversationSummary | null>(null)
  const [messages, setMessages] = useState<RoomChatArchiveMessage[]>([])
  const [contactStatuses, setContactStatuses] = useState<Record<string, ContactStatus>>({})
  const [pendingFavoriteUserId, setPendingFavoriteUserId] = useState<string | null>(null)
  const [pendingChatUserId, setPendingChatUserId] = useState<string | null>(null)

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

  const uniqueMessages = useMemo(() => {
    const m = new Map<string, RoomChatArchiveMessage>()
    for (const msg of messages) {
      const id = String(msg.id ?? '').trim()
      if (!id) continue
      if (!m.has(id)) m.set(id, msg)
    }
    return [...m.values()]
  }, [messages])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!user?.id) {
        if (active) setContactStatuses({})
        return
      }

      const targetUserIds = Array.from(
        new Set(
          uniqueMessages
            .map((message) => message.senderUserId?.trim() ?? '')
            .filter((id) => id && id !== user.id),
        ),
      )

      if (targetUserIds.length === 0) {
        if (active) setContactStatuses({})
        return
      }

      const result = await getContactStatuses(targetUserIds)
      if (!active) return
      if (result.error) {
        setError(result.error)
        return
      }
      setContactStatuses(result.data ?? {})
    }

    void run()
    return () => {
      active = false
    }
  }, [uniqueMessages, user?.id])

  const toggleFavorite = async (targetUserId: string, currentValue: boolean) => {
    if (!targetUserId || pendingFavoriteUserId) return
    setPendingFavoriteUserId(targetUserId)
    const result = await setContactPin(targetUserId, !currentValue)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setContactStatuses((prev) => ({
        ...prev,
        [targetUserId]: result.data!,
      }))
    }
    setPendingFavoriteUserId(null)
  }

  const openDirectChat = async (targetUserId: string, targetName: string) => {
    if (!targetUserId || pendingChatUserId) return
    setPendingChatUserId(targetUserId)
    const result = await ensureDirectConversationWithUser(targetUserId, targetName)
    if (result.error || !result.data) {
      setError(result.error ?? 'Не удалось открыть личный чат.')
      setPendingChatUserId(null)
      return
    }
    navigate(`/dashboard/messenger/${encodeURIComponent(result.data)}`)
    setPendingChatUserId(null)
  }

  return (
    <DashboardShell active="chats" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section">
        <div className="dashboard-chat-view__head">
          <div className="dashboard-chat-view__titleline">
            <h2 className="dashboard-section__title">{conversation?.title ?? 'Архив чата'}</h2>
            <Link to="/dashboard/chats" className="dashboard-chat-view__back">
              ← Назад к списку чатов
            </Link>
          </div>
          {conversation ? (
            <div className="dashboard-chat-view__summary">
              <span>{conversation.roomSlug ?? '—'}</span>
              <span>{conversation.closedAt ? 'Завершён' : 'Активен'}</span>
              <span>{conversation.messageCount} сообщ.</span>
            </div>
          ) : null}
        </div>

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}

        {!loading && !error ? (
          <div className="dashboard-chat-thread">
            {uniqueMessages.length === 0 ? (
              <div className="dashboard-chats-empty">В этом архиве пока нет сообщений.</div>
            ) : (
              uniqueMessages.map((message) => {
                const senderUserId = message.senderUserId?.trim() ?? ''
                const contact = senderUserId ? contactStatuses[senderUserId] : undefined
                const canActOnAuthor = Boolean(senderUserId && user?.id && senderUserId !== user.id)

                return (
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
                      <div className="dashboard-chat-message__authorline">
                        <span className="dashboard-chat-message__author">{message.senderNameSnapshot}</span>
                        {canActOnAuthor ? (
                          <span className="dashboard-chat-message__actions">
                            <button
                              type="button"
                              className={`dashboard-chat-message__action${
                                contact?.pinnedByMe ? ' dashboard-chat-message__action--active' : ''
                              }`}
                              disabled={pendingFavoriteUserId === senderUserId}
                              onClick={() => void toggleFavorite(senderUserId, contact?.pinnedByMe ?? false)}
                              title={
                                contact?.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты'
                              }
                              aria-label={
                                contact?.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты'
                              }
                            >
                              <StarIcon filled={contact?.pinnedByMe === true} />
                            </button>
                            <button
                              type="button"
                              className="dashboard-chat-message__action"
                              disabled={pendingChatUserId === senderUserId}
                              onClick={() => void openDirectChat(senderUserId, message.senderNameSnapshot)}
                              title="Открыть личный чат"
                            >
                              <ChatBubbleIcon />
                            </button>
                          </span>
                        ) : null}
                      </div>
                      <time className="dashboard-chat-message__time" dateTime={message.createdAt}>
                        {formatDateTime(message.createdAt)}
                      </time>
                    </div>
                    <div className="dashboard-chat-message__body">
                      <MessengerMessageBody text={message.body} />
                    </div>
                  </article>
                )
              })
            )}
          </div>
        ) : null}
      </section>
    </DashboardShell>
  )
}
