import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useProfile } from '../hooks/useProfile'
import {
  appendDirectMessage,
  type DirectConversationSummary,
  type DirectMessage,
  ensureDirectConversationWithUser,
  ensureSelfDirectConversation,
  getDirectConversationForUser,
  listDirectConversationsForUser,
  listDirectMessagesForUser,
  markDirectConversationRead,
} from '../lib/messenger'
import { DashboardShell } from './DashboardShell'

function formatDateTime(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function conversationInitial(title: string): string {
  return (title.trim().charAt(0) || 'С').toUpperCase()
}

export function DashboardMessengerPage() {
  const { conversationId: rawConversationId } = useParams<{ conversationId?: string }>()
  const routeConversationId = rawConversationId?.trim() ?? ''
  const [searchParams] = useSearchParams()
  const searchConversationId = searchParams.get('chat')?.trim() ?? ''
  const conversationId = searchConversationId || routeConversationId
  const targetUserId = searchParams.get('with')?.trim() ?? ''
  const targetTitle = searchParams.get('title')?.trim() ?? ''
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { profile } = useProfile()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const isMobileMessenger = useMediaQuery('(max-width: 900px)')

  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DirectConversationSummary[]>([])
  const [activeConversation, setActiveConversation] = useState<DirectConversationSummary | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const buildMessengerUrl = (chatId?: string, withUserId?: string, withTitle?: string) => {
    const params = new URLSearchParams()
    if (chatId) params.set('chat', chatId)
    if (withUserId) params.set('with', withUserId)
    if (withTitle) params.set('title', withTitle)
    const qs = params.toString()
    return qs ? `/dashboard/messenger?${qs}` : '/dashboard/messenger'
  }

  const selectConversation = (nextConversationId: string) => {
    navigate(buildMessengerUrl(nextConversationId), { replace: false })
  }

  useEffect(() => {
    if (!routeConversationId || searchConversationId) return
    navigate(buildMessengerUrl(routeConversationId, targetUserId || undefined, targetTitle || undefined), {
      replace: true,
    })
  }, [navigate, routeConversationId, searchConversationId, targetTitle, targetUserId])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!user?.id) {
        if (active) {
          setItems([])
          setActiveConversation(null)
          setMessages([])
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)

      const ensured = targetUserId
        ? await ensureDirectConversationWithUser(targetUserId, targetTitle || null)
        : await ensureSelfDirectConversation()

      if (!active) return
      if (ensured.error) {
        setError(ensured.error)
        setLoading(false)
        return
      }

      const listRes = await listDirectConversationsForUser()
      if (!active) return
      if (listRes.error) {
        setError(listRes.error)
        setItems([])
        setLoading(false)
        return
      }

      const nextItems = listRes.data ?? []
      setItems(nextItems)

      const targetConversationId = conversationId || ensured.data || nextItems[0]?.id || ''

      if (!searchConversationId && targetConversationId) {
        navigate(buildMessengerUrl(targetConversationId, targetUserId || undefined, targetTitle || undefined), {
          replace: true,
        })
      }

      if (!targetConversationId) {
        setActiveConversation(null)
        setMessages([])
        setLoading(false)
        return
      }

      setLoading(false)
    }

    void run()
    return () => {
      active = false
    }
  }, [conversationId, navigate, searchConversationId, targetTitle, targetUserId, user?.id])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!user?.id || loading) return
      const targetConversationId = conversationId || items[0]?.id || ''
      if (!targetConversationId) {
        if (active) {
          setActiveConversation(null)
          setMessages([])
          setThreadLoading(false)
        }
        return
      }

      setThreadLoading(true)
      const [conversationRes, messagesRes] = await Promise.all([
        getDirectConversationForUser(targetConversationId),
        listDirectMessagesForUser(targetConversationId),
      ])

      if (!active) return

      if (conversationRes.error) {
        setError(conversationRes.error)
        setActiveConversation(null)
        setMessages([])
      } else if (!conversationRes.data) {
        setError('Чат не найден или у вас нет к нему доступа.')
        setActiveConversation(null)
        setMessages([])
      } else if (messagesRes.error) {
        setError(messagesRes.error)
        setActiveConversation(conversationRes.data)
        setMessages([])
      } else {
        setActiveConversation(conversationRes.data)
        setMessages(messagesRes.data ?? [])
        void markDirectConversationRead(targetConversationId)
      }

      setThreadLoading(false)
    }

    void run()
    return () => {
      active = false
    }
  }, [conversationId, items, loading, user?.id])

  const activeConversationId = activeConversation?.id ?? conversationId
  const showListPane = !isMobileMessenger || !activeConversationId
  const showThreadPane = !isMobileMessenger || Boolean(activeConversationId)

  const sendMessage = async () => {
    const trimmed = draft.trim()
    if (!trimmed || !user?.id || !activeConversationId || sending) return

    setSending(true)
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: 'Вы',
      kind: 'text',
      body: trimmed,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft('')

    const res = await appendDirectMessage(activeConversationId, trimmed)
    if (res.error) {
      setError(res.error)
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(trimmed)
      setSending(false)
      return
    }

    const refresh = await listDirectMessagesForUser(activeConversationId)
    if (!refresh.error && refresh.data) {
      setMessages(refresh.data)
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === activeConversationId
          ? {
              ...item,
              lastMessageAt: res.data?.createdAt ?? optimistic.createdAt,
              lastMessagePreview: trimmed,
              messageCount: item.messageCount + 1,
              unreadCount: 0,
            }
          : item,
      ),
    )
    setSending(false)
  }

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const aTs = new Date(a.lastMessageAt ?? a.createdAt).getTime()
        const bTs = new Date(b.lastMessageAt ?? b.createdAt).getTime()
        return bTs - aTs
      }),
    [items],
  )

  const activeAvatarUrl =
    activeConversation?.avatarUrl ?? (activeConversation?.otherUserId ? null : profile?.avatar_url ?? null)

  return (
    <DashboardShell active="messenger" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section dashboard-messenger">
        <div className="dashboard-messenger__topbar">
          <div>
            <h2 className="dashboard-section__title">Мессенджер</h2>
            <p className="dashboard-section__hint">
              Постоянные личные переписки. Для старта уже есть чат с самим собой, который можно
              использовать как заметки.
            </p>
          </div>
          <Link to="/dashboard/chats" className="dashboard-messenger__switch">
            Архивы комнат
          </Link>
        </div>

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}

        {!loading && !error ? (
          <div className="dashboard-messenger__layout">
            {showListPane ? (
              <aside className="dashboard-messenger__list" aria-label="Список диалогов">
                {sortedItems.length === 0 ? (
                  <div className="dashboard-chats-empty">Диалогов пока нет.</div>
                ) : (
                  sortedItems.map((item) => {
                    const avatarUrl = item.avatarUrl ?? (!item.otherUserId ? profile?.avatar_url ?? null : null)
                    return (
                      <Link
                        key={item.id}
                        to={buildMessengerUrl(item.id)}
                        onClick={(e) => {
                          e.preventDefault()
                          selectConversation(item.id)
                        }}
                        className={`dashboard-messenger__row${
                          item.id === activeConversationId ? ' dashboard-messenger__row--active' : ''
                        }`}
                      >
                        <div className="dashboard-messenger__row-main">
                          <div className="dashboard-messenger__row-avatar" aria-hidden>
                            {avatarUrl ? (
                              <img src={avatarUrl ?? undefined} alt="" />
                            ) : (
                              <span>{conversationInitial(item.title)}</span>
                            )}
                          </div>
                          <div className="dashboard-messenger__row-content">
                            <div className="dashboard-messenger__row-titleline">
                              <div className="dashboard-messenger__row-title">{item.title}</div>
                              {item.unreadCount > 0 ? (
                                <span className="dashboard-messenger__row-badge">
                                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                </span>
                              ) : null}
                            </div>
                            <div className="dashboard-messenger__row-meta">
                              <span>{item.messageCount} сообщ.</span>
                              <span>{formatDateTime(item.lastMessageAt ?? item.createdAt)}</span>
                            </div>
                            <div className="dashboard-messenger__row-preview">
                              {item.lastMessagePreview?.trim() || 'Пока без сообщений'}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })
                )}
              </aside>
            ) : null}

            {showThreadPane ? (
              <div className="dashboard-messenger__thread">
                {activeConversation ? (
                  <>
                    <div className="dashboard-messenger__thread-head">
                      {isMobileMessenger ? (
                        <button
                          type="button"
                          className="dashboard-messenger__back-btn"
                          onClick={() => navigate('/dashboard/messenger')}
                        >
                          ← Назад к чатам
                        </button>
                      ) : null}
                      <div className="dashboard-messenger__thread-head-main">
                        <div className="dashboard-messenger__thread-avatar" aria-hidden>
                          {activeAvatarUrl ? (
                            <img src={activeAvatarUrl ?? undefined} alt="" />
                          ) : (
                            <span>{conversationInitial(activeConversation.title)}</span>
                          )}
                        </div>
                        <div>
                          <h3 className="dashboard-section__subtitle">{activeConversation.title}</h3>
                          <div className="dashboard-messenger__thread-meta">
                            <span>{activeConversation.messageCount} сообщ.</span>
                            <span>
                              Последняя активность:{' '}
                              {formatDateTime(activeConversation.lastMessageAt ?? activeConversation.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="dashboard-messenger__messages">
                      {threadLoading ? (
                        <div className="dashboard-messenger__thread-loading">
                          <div className="auth-loading" aria-label="Загрузка диалога..." />
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="dashboard-chats-empty">Напиши первое сообщение в этот чат.</div>
                      ) : (
                        messages.map((message) => {
                          const isOwn = user?.id && message.senderUserId === user.id
                          return (
                            <article
                              key={message.id}
                              className={`dashboard-messenger__message${
                                isOwn ? ' dashboard-messenger__message--own' : ''
                              }`}
                            >
                              <div className="dashboard-messenger__message-meta">
                                <span className="dashboard-messenger__message-author">
                                  {message.senderNameSnapshot}
                                </span>
                                <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                              </div>
                              <div className="dashboard-messenger__message-body">{message.body}</div>
                            </article>
                          )
                        })
                      )}
                    </div>

                    <div className="dashboard-messenger__composer">
                      <textarea
                        className="dashboard-messenger__input"
                        rows={3}
                        placeholder="Напиши сообщение..."
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void sendMessage()
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn"
                        disabled={!draft.trim() || sending}
                        onClick={() => void sendMessage()}
                      >
                        Отправить
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="dashboard-chats-empty">Выберите диалог слева.</div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </DashboardShell>
  )
}
