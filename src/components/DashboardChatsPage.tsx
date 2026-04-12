import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  type RoomChatConversationSummary,
  type RoomChatLastSender,
  listRoomChatConversationsForUser,
  listRoomChatLastSenders,
} from '../lib/chatArchive'
import { DashboardMenuPicker, type DashboardMenuOption } from './DashboardMenuPicker'
import { DashboardShell } from './DashboardShell'
import { ChatBubbleIcon } from './icons'

type ChatSortMode = 'recent_desc' | 'recent_asc' | 'messages_desc' | 'messages_asc'
type ChatTimeFilter = 'all' | 'today' | '7d' | '30d'

const CHAT_SORT_OPTIONS: DashboardMenuOption<ChatSortMode>[] = [
  { value: 'recent_desc', label: 'Сначала новые' },
  { value: 'recent_asc', label: 'Сначала старые' },
  { value: 'messages_desc', label: 'Больше сообщений' },
  { value: 'messages_asc', label: 'Меньше сообщений' },
]

const CHAT_TIME_FILTER_OPTIONS: DashboardMenuOption<ChatTimeFilter>[] = [
  { value: 'all', label: 'За всё время' },
  { value: 'today', label: 'Сегодня' },
  { value: '7d', label: 'За 7 дней' },
  { value: '30d', label: 'За 30 дней' },
]

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function applyTimeFilter(items: RoomChatConversationSummary[], filter: ChatTimeFilter): RoomChatConversationSummary[] {
  if (filter === 'all') return items
  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const minTs =
    filter === 'today'
      ? startOfToday.getTime()
      : now - (filter === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000

  return items.filter((item) => {
    const source = item.lastMessageAt ?? item.createdAt
    const ts = source ? new Date(source).getTime() : Number.NaN
    return Number.isFinite(ts) && ts >= minTs
  })
}

function sortChatItems(items: RoomChatConversationSummary[], mode: ChatSortMode): RoomChatConversationSummary[] {
  const next = [...items]
  next.sort((a, b) => {
    const aRecent = new Date(a.lastMessageAt ?? a.createdAt).getTime()
    const bRecent = new Date(b.lastMessageAt ?? b.createdAt).getTime()

    if (mode === 'recent_desc') return bRecent - aRecent
    if (mode === 'recent_asc') return aRecent - bRecent
    if (mode === 'messages_desc') {
      if (b.messageCount !== a.messageCount) return b.messageCount - a.messageCount
      return bRecent - aRecent
    }
    if (a.messageCount !== b.messageCount) return a.messageCount - b.messageCount
    return bRecent - aRecent
  })
  return next
}

export function DashboardChatsPage() {
  const { signOut, user } = useAuth()
  const { openUserPeek } = useUserPeek()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<RoomChatConversationSummary[]>([])
  const [lastSenders, setLastSenders] = useState<Record<string, RoomChatLastSender>>({})
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<ChatSortMode>('recent_desc')
  const [timeFilter, setTimeFilter] = useState<ChatTimeFilter>('all')

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
        setLastSenders({})
      } else {
        const nextItems = result.data ?? []
        setItems(nextItems)
        const senders = await listRoomChatLastSenders(nextItems.map((item) => item.id))
        if (!active) return
        if (!senders.error) {
          setLastSenders(senders.data ?? {})
        }
      }
      setLoading(false)
    }
    void run()
    return () => {
      active = false
    }
  }, [user?.id])

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    let next = items

    if (q) {
      next = next.filter((item) => {
        const haystack = [item.title, item.roomSlug ?? '', item.lastMessagePreview ?? ''].join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }

    next = applyTimeFilter(next, timeFilter)
    return sortChatItems(next, sortMode)
  }, [items, query, sortMode, timeFilter])

  return (
    <DashboardShell active="chats" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section">
        <div className="dashboard-chat-page__head">
          <h2 className="dashboard-section__title dashboard-chat-page__page-title">Чаты комнат</h2>
          <Link to="/dashboard/messenger" className="dashboard-messenger__switch">
            Мессенджер
          </Link>
        </div>

        {!loading && !error && items.length > 0 ? (
          <div className="dashboard-chat-filters">
            <label className="dashboard-chat-filters__search">
              <span className="dashboard-chat-filters__label">Поиск</span>
              <input
                type="search"
                className="dashboard-chat-filters__input"
                placeholder="Название, комната или фрагмент сообщения"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>

            <div className="dashboard-chat-filters__control">
              <span className="dashboard-chat-filters__label">Сортировка</span>
              <DashboardMenuPicker
                value={sortMode}
                onChange={setSortMode}
                options={CHAT_SORT_OPTIONS}
                ariaLabelPrefix="Сортировка"
                modifierClass="admin-role-picker--dashboard-filters"
              />
            </div>

            <div className="dashboard-chat-filters__control">
              <span className="dashboard-chat-filters__label">Период</span>
              <DashboardMenuPicker
                value={timeFilter}
                onChange={setTimeFilter}
                options={CHAT_TIME_FILTER_OPTIONS}
                ariaLabelPrefix="Период"
                modifierClass="admin-role-picker--dashboard-filters"
              />
            </div>
          </div>
        ) : null}

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}
        {!loading && !error && items.length === 0 ? (
          <div className="dashboard-chats-empty">
            После завершения вашей первой комнаты здесь появится архив переписки.
          </div>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="dashboard-chat-list">
            {filteredItems.length === 0 ? (
              <div className="dashboard-chats-empty">По текущим фильтрам ничего не найдено.</div>
            ) : (
              filteredItems.map((item) => (
                <Link key={item.id} to={`/dashboard/chats/${encodeURIComponent(item.id)}`} className="dashboard-chat-row">
                  <div className="dashboard-chat-row__main">
                    <div className="dashboard-chat-row__titleline">
                      <div className="dashboard-chat-row__titlewrap">
                        <span className="dashboard-chat-row__title">{item.title}</span>
                        <span className="dashboard-chat-row__count" title={`Сообщений: ${item.messageCount}`}>
                          <span className="dashboard-chat-row__count-icon" aria-hidden>
                            <ChatBubbleIcon />
                          </span>
                          <span>{item.messageCount}</span>
                        </span>
                      </div>
                      <div className="dashboard-chat-row__statusline">
                        <span className="dashboard-chat-row__activity">
                          {formatDateTime(item.lastMessageAt ?? item.createdAt)}
                        </span>
                        <span
                          className={`dashboard-badge ${
                            item.closedAt ? 'dashboard-badge--pending' : 'dashboard-badge--active'
                          }`}
                        >
                          {item.closedAt ? 'Завершён' : 'Активен'}
                        </span>
                      </div>
                    </div>
                    {lastSenders[item.id] ? (
                      <div className="dashboard-chat-row__last-author">
                        {lastSenders[item.id].senderUserId?.trim() ? (
                          <button
                            type="button"
                            className="dashboard-chat-row__last-author-avatar dashboard-chat-row__last-author-avatar--btn"
                            aria-label={`Профиль: ${lastSenders[item.id].senderNameSnapshot}`}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              openUserPeek({
                                userId: lastSenders[item.id].senderUserId!.trim(),
                                displayName: lastSenders[item.id].senderNameSnapshot,
                                avatarUrl: lastSenders[item.id].avatarUrl,
                              })
                            }}
                          >
                            {lastSenders[item.id].avatarUrl ? (
                              <img
                                className="dashboard-chat-row__last-author-avatar-img"
                                src={lastSenders[item.id].avatarUrl ?? undefined}
                                alt=""
                              />
                            ) : (
                              <span
                                className="dashboard-chat-row__last-author-avatar dashboard-chat-row__last-author-avatar--placeholder"
                                aria-hidden
                              />
                            )}
                          </button>
                        ) : lastSenders[item.id].avatarUrl ? (
                          <img
                            className="dashboard-chat-row__last-author-avatar"
                            src={lastSenders[item.id].avatarUrl ?? undefined}
                            alt=""
                          />
                        ) : (
                          <span className="dashboard-chat-row__last-author-avatar dashboard-chat-row__last-author-avatar--placeholder" aria-hidden />
                        )}
                        <span className="dashboard-chat-row__last-author-name">
                          {lastSenders[item.id].senderNameSnapshot}
                        </span>
                      </div>
                    ) : null}
                    <div className="dashboard-chat-row__preview">
                      {item.lastMessagePreview?.trim() || 'Сообщений пока нет'}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        ) : null}
      </section>
    </DashboardShell>
  )
}
