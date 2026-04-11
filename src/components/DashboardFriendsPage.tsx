import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { type ContactCard, listMyContacts, setUserFavorite } from '../lib/socialGraph'
import { DashboardMenuPicker, type DashboardMenuOption } from './DashboardMenuPicker'
import { DashboardShell } from './DashboardShell'
import { StarIcon } from './icons'

type FriendFilter = 'all' | 'friends' | 'favorites' | 'incoming'

const FRIEND_FILTER_OPTIONS: DashboardMenuOption<FriendFilter>[] = [
  { value: 'all', label: 'Все' },
  { value: 'friends', label: 'Друзья' },
  { value: 'favorites', label: 'Моё избранное' },
  { value: 'incoming', label: 'Добавили меня' },
]

function matchesFriendFilter(item: ContactCard, filter: FriendFilter): boolean {
  if (filter === 'friends') return item.isFriend
  if (filter === 'favorites') return item.isFavorite
  if (filter === 'incoming') return item.favorsMe && !item.isFavorite
  return true
}

function statusLabel(item: ContactCard): string {
  if (item.isFriend) return 'Друзья'
  if (item.isFavorite) return 'В избранном'
  if (item.favorsMe) return 'Добавил вас'
  return 'Контакт'
}

export function DashboardFriendsPage() {
  const { signOut } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ContactCard[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FriendFilter>('all')
  const [busyTarget, setBusyTarget] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void listMyContacts().then((result) => {
      if (!active) return
      if (result.error) {
        setError(result.error)
        setItems([])
      } else {
        setError(null)
        setItems(result.data ?? [])
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (!matchesFriendFilter(item, filter)) return false
      if (!q) return true
      return item.displayName.toLowerCase().includes(q)
    })
  }, [items, query, filter])

  const toggleFavorite = async (item: ContactCard) => {
    if (busyTarget) return
    const nextFavorite = !item.isFavorite
    setBusyTarget(item.targetUserId)
    setItems((prev) =>
      prev.map((row) =>
        row.targetUserId === item.targetUserId
          ? {
              ...row,
              isFavorite: nextFavorite,
              isFriend: nextFavorite && row.favorsMe,
            }
          : row,
      ),
    )
    const result = await setUserFavorite(item.targetUserId, nextFavorite)
    setBusyTarget(null)
    if (result.error || !result.data) {
      setItems((prev) => prev.map((row) => (row.targetUserId === item.targetUserId ? item : row)))
      setError(result.error ?? 'Не удалось обновить избранное')
      return
    }
    setError(null)
    setItems((prev) =>
      prev.map((row) =>
        row.targetUserId === item.targetUserId
          ? {
              ...row,
              isFavorite: result.data!.isFavorite,
              favorsMe: result.data!.favorsMe,
              isFriend: result.data!.isFriend,
            }
          : row,
      ),
    )
  }

  return (
    <DashboardShell active="friends" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section">
        <h2 className="dashboard-section__title dashboard-friends__page-title">Друзья и избранные</h2>

        <div className="dashboard-chat-filters">
          <label className="dashboard-chat-filters__search">
            <span className="dashboard-chat-filters__label">Поиск</span>
            <input
              type="search"
              className="dashboard-chat-filters__input"
              placeholder="Имя пользователя"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <div className="dashboard-chat-filters__control">
            <span className="dashboard-chat-filters__label">Фильтр</span>
            <DashboardMenuPicker
              value={filter}
              onChange={setFilter}
              options={FRIEND_FILTER_OPTIONS}
              ariaLabelPrefix="Фильтр"
              modifierClass="admin-role-picker--dashboard-filters"
            />
          </div>
        </div>

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <div className="dashboard-chats-empty">
            {filter === 'friends'
              ? 'Пока нет взаимных друзей. Добавьте человека в избранное из чата комнаты — когда он ответит взаимностью, вы появитесь друг у друга здесь.'
              : filter === 'favorites'
                ? 'В избранном пока никого. Добавляйте людей из чата комнаты кнопкой со звёздочкой у сообщения.'
                : filter === 'incoming'
                  ? 'Пока никто не добавил вас в избранное.'
                  : 'Пока здесь пусто. Добавляйте людей в избранное прямо из чата комнаты.'}
          </div>
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <div className="dashboard-friends-list">
            {filtered.map((item) => (
              <article key={item.targetUserId} className="dashboard-friend-card">
                <div className="dashboard-friend-card__main">
                  <div className="dashboard-friend-card__avatar">
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt={item.displayName} />
                    ) : (
                      <span>{item.displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="dashboard-friend-card__text">
                    <div className="dashboard-friend-card__titleline">
                      <span className="dashboard-friend-card__name">{item.displayName}</span>
                      <span className={`dashboard-badge ${item.isFriend ? 'dashboard-badge--active' : 'dashboard-badge--pending'}`}>
                        {statusLabel(item)}
                      </span>
                    </div>
                    <div className="dashboard-friend-card__meta">
                      <span>{item.isFavorite ? 'У вас в избранном' : 'Не в избранном'}</span>
                      <span>{item.favorsMe ? 'Добавил вас' : 'Ещё не добавил вас'}</span>
                    </div>
                  </div>
                </div>

                <div className="dashboard-friend-card__actions">
                  {item.isFavorite ? (
                    <button
                      type="button"
                      className="dashboard-friend-card__remove-fav"
                      disabled={busyTarget === item.targetUserId}
                      onClick={() => void toggleFavorite(item)}
                    >
                      Убрать из избранного
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`dashboard-friend-card__fav-btn${item.isFavorite ? ' dashboard-friend-card__fav-btn--active' : ''}`}
                    onClick={() => void toggleFavorite(item)}
                    disabled={busyTarget === item.targetUserId}
                    title={item.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                  >
                    <StarIcon filled={item.isFavorite} />
                    <span>{item.isFavorite ? 'В избранном' : 'В избранное'}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </DashboardShell>
  )
}
