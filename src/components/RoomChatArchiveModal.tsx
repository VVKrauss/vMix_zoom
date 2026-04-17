import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  type RoomChatArchiveMessage,
  type RoomChatConversationSummary,
  getRoomChatConversationForUser,
  listRoomChatMessagesForUser,
} from '../lib/chatArchive'
import { ensureDirectConversationWithUser } from '../lib/messenger'
import { getContactStatuses, setContactPin, type ContactStatus } from '../lib/socialGraph'
import { ChatBubbleIcon, StarIcon, XCloseIcon } from './icons'
import { MessengerMessageBody } from './MessengerMessageBody'

function formatDateTime(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

type Props = {
  open: boolean
  conversationId: string | null
  summary: RoomChatConversationSummary | null
  userId: string
  onClose: () => void
}

export function RoomChatArchiveModal({ open, conversationId, summary, userId, onClose }: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<RoomChatConversationSummary | null>(null)
  const [messages, setMessages] = useState<RoomChatArchiveMessage[]>([])
  const [contactStatuses, setContactStatuses] = useState<Record<string, ContactStatus>>({})
  const [pendingFavoriteUserId, setPendingFavoriteUserId] = useState<string | null>(null)
  const [pendingChatUserId, setPendingChatUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !conversationId) {
      setConversation(null)
      setMessages([])
      setError(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    void (async () => {
      const [conversationRes, messagesRes] = await Promise.all([
        getRoomChatConversationForUser(conversationId, userId),
        listRoomChatMessagesForUser(conversationId, userId),
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
    })()

    return () => {
      active = false
    }
  }, [open, conversationId, userId])

  useEffect(() => {
    if (!open || !userId) {
      setContactStatuses({})
      return
    }

    let active = true
    const targetUserIds = Array.from(
      new Set(
        messages
          .map((message) => message.senderUserId?.trim() ?? '')
          .filter((id) => id && id !== userId),
      ),
    )

    if (targetUserIds.length === 0) {
      setContactStatuses({})
      return
    }

    void (async () => {
      const result = await getContactStatuses(targetUserIds)
      if (!active) return
      if (result.error) {
        setError(result.error)
        return
      }
      setContactStatuses(result.data ?? {})
    })()

    return () => {
      active = false
    }
  }, [open, messages, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !conversationId) return null

  const display = conversation ?? summary

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
    onClose()
    navigate(`/dashboard/messenger/${encodeURIComponent(result.data)}`)
    setPendingChatUserId(null)
  }

  return createPortal(
    <div className="room-chat-archive-modal-root" role="presentation">
      <button type="button" className="room-chat-archive-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="room-chat-archive-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-chat-archive-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="room-chat-archive-modal__head">
          <div className="room-chat-archive-modal__titles">
            <h2 id="room-chat-archive-modal-title" className="room-chat-archive-modal__title">
              {display?.title ?? 'Чат комнаты'}
            </h2>
            {display ? (
              <div className="room-chat-archive-modal__meta">
                <span>{display.roomSlug ?? '—'}</span>
                <span>{display.closedAt ? 'Завершён' : 'Активен'}</span>
                <span>{display.messageCount} сообщ.</span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="room-chat-archive-modal__close"
            aria-label="Закрыть"
            title="Закрыть"
            onClick={onClose}
          >
            <XCloseIcon />
          </button>
        </header>

        <div className="room-chat-archive-modal__body">
          {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
          {!loading && error ? <p className="join-error room-chat-archive-modal__error">{error}</p> : null}
          {!loading && !error ? (
            <div className="room-chat-archive-modal__thread">
              {messages.length === 0 ? (
                <div className="dashboard-chats-empty">В этом чате пока нет сообщений.</div>
              ) : (
                messages.map((message) => {
                  const senderUserId = message.senderUserId?.trim() ?? ''
                  const contact = senderUserId ? contactStatuses[senderUserId] : undefined
                  const canActOnAuthor = Boolean(senderUserId && userId && senderUserId !== userId)

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
        </div>
      </div>
    </div>,
    document.body,
  )
}
