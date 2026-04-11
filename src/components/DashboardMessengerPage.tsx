import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  listDirectMessagesPage,
  mapDirectMessageFromRow,
  markDirectConversationRead,
} from '../lib/messenger'
import { supabase } from '../lib/supabase'
import { BrandLogoLoader } from './BrandLogoLoader'
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

const MESSENGER_LAST_OPEN_KEY = 'vmix.messenger.lastOpenConversation'
const DM_PAGE_SIZE = 50

function sortConversationsByActivity(list: DirectConversationSummary[]): DirectConversationSummary[] {
  return [...list].sort((a, b) => {
    const aTs = new Date(a.lastMessageAt ?? a.createdAt).getTime()
    const bTs = new Date(b.lastMessageAt ?? b.createdAt).getTime()
    return bTs - aTs
  })
}

/** URL пустой: последний открытый диалог из localStorage, иначе самый свежий по активности, иначе запасной id (напр. «с собой»). */
function pickDefaultConversationId(
  list: DirectConversationSummary[],
  fallbackId: string | null,
): string {
  if (list.length === 0) return fallbackId?.trim() || ''
  try {
    const stored = localStorage.getItem(MESSENGER_LAST_OPEN_KEY)?.trim()
    if (stored && list.some((i) => i.id === stored)) return stored
  } catch {
    /* ignore */
  }
  const sorted = sortConversationsByActivity(list)
  return sorted[0]?.id || fallbackId?.trim() || ''
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
  /** Мобильный режим «только дерево чатов» — не подставлять chat в URL и не грузить тред */
  const listOnlyMobile = isMobileMessenger && searchParams.get('view') === 'list'

  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DirectConversationSummary[]>([])
  const [activeConversation, setActiveConversation] = useState<DirectConversationSummary | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId
  const itemsRef = useRef(items)
  itemsRef.current = items
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const olderFetchInFlightRef = useRef(false)
  const prevThreadIdForClearRef = useRef<string | null>(null)
  const prevMessagesLenForScrollRef = useRef(0)
  /** Уже загруженные сообщения для этого id — не дергать API при повторном срабатывании эффекта (напр. loading). */
  const lastFetchedThreadIdRef = useRef<string | null>(null)
  const threadFetchInFlightRef = useRef<string | null>(null)
  /** После первой успешной загрузки списка — повторный bootstrap при «Назад к чатам» не нужен */
  const listLoadedOnceRef = useRef(false)

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
        listLoadedOnceRef.current = false
        lastFetchedThreadIdRef.current = null
        threadFetchInFlightRef.current = null
        prevThreadIdForClearRef.current = null
        if (active) {
          setItems([])
          setActiveConversation(null)
          setMessages([])
          setLoading(false)
        }
        return
      }

      const treeOnlyReturn =
        isMobileMessenger && searchParams.get('view') === 'list' && listLoadedOnceRef.current
      if (treeOnlyReturn) {
        if (active) {
          setLoading(false)
          setError(null)
        }
        return
      }

      if (!listLoadedOnceRef.current || Boolean(targetUserId?.trim())) {
        setLoading(true)
      }
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
      listLoadedOnceRef.current = true

      const targetConversationId =
        conversationIdRef.current.trim() ||
        pickDefaultConversationId(nextItems, ensured.data) ||
        ''

      if (
        !searchConversationId &&
        targetConversationId &&
        !(isMobileMessenger && searchParams.get('view') === 'list')
      ) {
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
  }, [isMobileMessenger, navigate, searchConversationId, searchParams, targetTitle, targetUserId, user?.id])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!user?.id || loading) return
      if (listOnlyMobile) {
        lastFetchedThreadIdRef.current = null
        threadFetchInFlightRef.current = null
        if (active) {
          setThreadLoading(false)
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
        }
        return
      }
      const targetConversationId =
        conversationId.trim() || pickDefaultConversationId(itemsRef.current, null) || ''
      if (!targetConversationId) {
        lastFetchedThreadIdRef.current = null
        if (active) {
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          setThreadLoading(false)
        }
        return
      }

      const prevOpenedId = prevThreadIdForClearRef.current
      const conversationSwitched = prevOpenedId !== targetConversationId
      if (conversationSwitched) {
        prevThreadIdForClearRef.current = targetConversationId
        lastFetchedThreadIdRef.current = null
        setMessages([])
        setHasMoreOlder(false)
      }

      if (lastFetchedThreadIdRef.current === targetConversationId) {
        if (active) setThreadLoading(false)
        return
      }

      if (threadFetchInFlightRef.current === targetConversationId) {
        return
      }
      threadFetchInFlightRef.current = targetConversationId
      setThreadLoading(true)

      try {
        const [conversationRes, messagesRes] = await Promise.all([
          getDirectConversationForUser(targetConversationId),
          listDirectMessagesPage(targetConversationId, { limit: DM_PAGE_SIZE }),
        ])

        if (!active) return

        if (conversationRes.error) {
          setError(conversationRes.error)
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else if (!conversationRes.data) {
          setError('Чат не найден или у вас нет к нему доступа.')
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else if (messagesRes.error) {
          setError(messagesRes.error)
          setActiveConversation(conversationRes.data)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else {
          setActiveConversation(conversationRes.data)
          setMessages(messagesRes.data ?? [])
          setHasMoreOlder(messagesRes.hasMoreOlder)
          lastFetchedThreadIdRef.current = targetConversationId
          void markDirectConversationRead(targetConversationId)
        }
      } finally {
        threadFetchInFlightRef.current = null
        if (active) setThreadLoading(false)
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [conversationId, listOnlyMobile, loading, user?.id])

  const activeConversationId = listOnlyMobile ? '' : conversationId || activeConversation?.id || ''

  useEffect(() => {
    if (listOnlyMobile || !activeConversationId) return
    try {
      localStorage.setItem(MESSENGER_LAST_OPEN_KEY, activeConversationId)
    } catch {
      /* ignore */
    }
  }, [activeConversationId, listOnlyMobile])
  const showListPane = !isMobileMessenger || !activeConversationId
  const showThreadPane = !isMobileMessenger || Boolean(activeConversationId)

  /** Новые сообщения в открытом треде без полной перезагрузки списка */
  useEffect(() => {
    const uid = user?.id
    const convId = activeConversationId
    if (!uid || !convId || listOnlyMobile) return

    const channel = supabase
      .channel(`dm-thread:${convId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id) return
          const msg = mapDirectMessageFromRow(row)
          const isOwn = msg.senderUserId === uid
          const preview =
            msg.kind === 'reaction' ? (msg.body.trim() || 'Реакция') : msg.body

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            let base = prev
            if (isOwn) {
              const i = prev.findIndex(
                (m) =>
                  m.id.startsWith('local-') &&
                  m.senderUserId === msg.senderUserId &&
                  m.body === msg.body &&
                  m.kind === msg.kind,
              )
              if (i !== -1) base = [...prev.slice(0, i), ...prev.slice(i + 1)]
            }
            const next = [...base, msg]
            next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            return next
          })

          if (!isOwn) {
            setItems((prev) =>
              prev.map((item) =>
                item.id === convId
                  ? {
                      ...item,
                      lastMessageAt: msg.createdAt,
                      lastMessagePreview: preview,
                      messageCount: item.messageCount + 1,
                      unreadCount: item.unreadCount + 1,
                    }
                  : item,
              ),
            )
            setActiveConversation((prev) =>
              prev && prev.id === convId
                ? {
                    ...prev,
                    lastMessageAt: msg.createdAt,
                    lastMessagePreview: preview,
                    messageCount: prev.messageCount + 1,
                    unreadCount: prev.unreadCount + 1,
                  }
                : prev,
            )
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeConversationId, listOnlyMobile, user?.id])

  const prevThreadLoadingRef = useRef(false)
  useLayoutEffect(() => {
    const wasLoading = prevThreadLoadingRef.current
    prevThreadLoadingRef.current = threadLoading
    if (wasLoading && !threadLoading && !listOnlyMobile && messages.length > 0) {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [threadLoading, listOnlyMobile, messages.length])

  const loadOlderMessages = useCallback(async () => {
    const convId = listOnlyMobile ? '' : conversationId.trim()
    const conv = convId || activeConversation?.id || ''
    if (!conv || loadingOlder || !hasMoreOlder || olderFetchInFlightRef.current) return
    const oldest = messages[0]
    if (!oldest?.id || oldest.id.startsWith('local-')) return

    const scrollEl = messagesScrollRef.current
    const prevScrollHeight = scrollEl?.scrollHeight ?? 0
    const prevScrollTop = scrollEl?.scrollTop ?? 0

    olderFetchInFlightRef.current = true
    setLoadingOlder(true)
    try {
      const res = await listDirectMessagesPage(conv, {
        limit: DM_PAGE_SIZE,
        before: { createdAt: oldest.createdAt, id: oldest.id },
      })
      if (res.error) {
        setError(res.error)
        return
      }
      const older = res.data ?? []
      if (older.length === 0) {
        setHasMoreOlder(false)
        return
      }
      setHasMoreOlder(res.hasMoreOlder)
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        const merged = [...older.filter((m) => !seen.has(m.id)), ...prev]
        merged.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
            a.id.localeCompare(b.id),
        )
        return merged
      })
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop
      })
    } finally {
      olderFetchInFlightRef.current = false
      setLoadingOlder(false)
    }
  }, [
    activeConversation?.id,
    conversationId,
    hasMoreOlder,
    listOnlyMobile,
    loadingOlder,
    messages,
  ])

  const lastOlderScrollInvokeRef = useRef(0)
  const onMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el || threadLoading || loadingOlder || !hasMoreOlder || olderFetchInFlightRef.current) return
    if (el.scrollTop > 96) return
    const now = Date.now()
    if (now - lastOlderScrollInvokeRef.current < 500) return
    lastOlderScrollInvokeRef.current = now
    void loadOlderMessages()
  }, [threadLoading, loadingOlder, hasMoreOlder, loadOlderMessages])

  useEffect(() => {
    if (loadingOlder || threadLoading) {
      prevMessagesLenForScrollRef.current = messages.length
      return
    }
    const el = messagesScrollRef.current
    const prevLen = prevMessagesLenForScrollRef.current
    const grew = messages.length > prevLen
    prevMessagesLenForScrollRef.current = messages.length
    if (!el || !grew) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages.length, threadLoading, loadingOlder])

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

    const snap = profile?.display_name?.trim() || 'Вы'
    const finalId = res.data?.messageId ?? optimistic.id
    const finalAt = res.data?.createdAt ?? optimistic.createdAt
    setMessages((prev) =>
      prev.map((m) =>
        m.id === optimistic.id
          ? { ...optimistic, id: finalId, createdAt: finalAt, senderNameSnapshot: snap }
          : m,
      ),
    )

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
    setActiveConversation((prev) =>
      prev && prev.id === activeConversationId
        ? {
            ...prev,
            lastMessageAt: res.data?.createdAt ?? optimistic.createdAt,
            lastMessagePreview: trimmed,
            messageCount: prev.messageCount + 1,
            unreadCount: 0,
          }
        : prev,
    )
    setSending(false)
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  const sortedItems = useMemo(() => sortConversationsByActivity(items), [items])

  /** Шапка треда: сразу из списка по URL, пока грузится полная карточка с сервера */
  const threadHeadConversation =
    sortedItems.find((i) => i.id === activeConversationId) ?? activeConversation

  const activeAvatarUrl =
    threadHeadConversation?.avatarUrl ??
    (threadHeadConversation?.otherUserId ? null : profile?.avatar_url ?? null)

  return (
    <DashboardShell active="messenger" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section dashboard-messenger dashboard-messenger--fill">
        <div className="dashboard-messenger__topbar">
          <h2 className="dashboard-section__title dashboard-messenger__page-title">Мессенджер</h2>
          <Link to="/dashboard/chats" className="dashboard-messenger__switch">
            Архивы комнат
          </Link>
        </div>

        {error ? <p className="join-error">{error}</p> : null}

        {!error ? (
          <div className="dashboard-messenger__layout">
            {showListPane ? (
              <aside className="dashboard-messenger__list" aria-label="Список диалогов">
                {loading && sortedItems.length === 0 ? (
                  <div className="dashboard-messenger__pane-loader" aria-label="Загрузка списка…">
                    <BrandLogoLoader size={56} />
                  </div>
                ) : sortedItems.length === 0 ? (
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
                {loading && !threadHeadConversation ? (
                  <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…">
                    <BrandLogoLoader size={56} />
                  </div>
                ) : threadHeadConversation ? (
                  <>
                    <div className="dashboard-messenger__thread-head">
                      {isMobileMessenger ? (
                        <button
                          type="button"
                          className="dashboard-messenger__back-btn"
                          onClick={() => navigate('/dashboard/messenger?view=list', { replace: true })}
                        >
                          ← Назад к чатам
                        </button>
                      ) : null}
                      <div className="dashboard-messenger__thread-head-main">
                        <div className="dashboard-messenger__thread-avatar" aria-hidden>
                          {activeAvatarUrl ? (
                            <img src={activeAvatarUrl ?? undefined} alt="" />
                          ) : (
                            <span>{conversationInitial(threadHeadConversation.title)}</span>
                          )}
                        </div>
                        <div>
                          <div className="dashboard-messenger__thread-titleline">
                            <h3 className="dashboard-section__subtitle">{threadHeadConversation.title}</h3>
                            {threadHeadConversation.unreadCount > 0 ? (
                              <span className="dashboard-messenger__row-badge">
                                {threadHeadConversation.unreadCount > 99
                                  ? '99+'
                                  : threadHeadConversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                          <div className="dashboard-messenger__thread-meta">
                            <span>{threadHeadConversation.messageCount} сообщ.</span>
                            <span>
                              Последняя активность:{' '}
                              {formatDateTime(
                                threadHeadConversation.lastMessageAt ?? threadHeadConversation.createdAt,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="dashboard-messenger__thread-main">
                      <div
                        ref={messagesScrollRef}
                        className="dashboard-messenger__messages-scroll"
                        onScroll={onMessagesScroll}
                      >
                        {loadingOlder ? (
                          <div className="dashboard-messenger__load-older" role="status" aria-live="polite">
                            Загрузка истории…
                          </div>
                        ) : null}
                        <div className="dashboard-messenger__messages">
                          {threadLoading ? (
                            <div
                              className="dashboard-messenger__thread-loading"
                              role="status"
                              aria-label="Загрузка диалога…"
                            >
                              <BrandLogoLoader size={56} />
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
                      </div>

                      <div className="dashboard-messenger__composer">
                        <textarea
                          className="dashboard-messenger__input"
                          rows={3}
                          placeholder="Напиши сообщение..."
                          value={draft}
                          disabled={threadLoading}
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
                          disabled={!draft.trim() || sending || threadLoading}
                          onClick={() => void sendMessage()}
                        >
                          Отправить
                        </button>
                      </div>
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
