import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  type ContactCard,
  type RegisteredUserSearchHit,
  listMyContacts,
  searchRegisteredUsers,
  setUserFavorite,
} from '../lib/socialGraph'
import { DashboardMenuPicker, type DashboardMenuOption } from './DashboardMenuPicker'
import { DashboardShell } from './DashboardShell'
import { ChevronLeftIcon, StarIcon } from './icons'

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
  const { signOut, user } = useAuth()
  const { openUserPeek } = useUserPeek()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ContactCard[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FriendFilter>('all')
  const [busyTarget, setBusyTarget] = useState<string | null>(null)
  const [registryHits, setRegistryHits] = useState<RegisteredUserSearchHit[]>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)

  const silentReloadContacts = useCallback(() => {
    void listMyContacts().then((result) => {
      if (result.error) {
        setError(result.error)
        return
      }
      setError(null)
      setItems(result.data ?? [])
    })
  }, [])

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

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setRegistryHits([])
      setRegistryError(null)
      setRegistryLoading(false)
      return
    }
    setRegistryLoading(true)
    setRegistryError(null)
    const t = window.setTimeout(() => {
      void searchRegisteredUsers(q).then((result) => {
        setRegistryLoading(false)
        if (result.error) {
          setRegistryError(result.error)
          setRegistryHits([])
          return
        }
        setRegistryError(null)
        setRegistryHits(result.data ?? [])
      })
    }, 320)
    return () => window.clearTimeout(t)
  }, [query])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (!matchesFriendFilter(item, filter)) return false
      if (!q) return true
      const slug = (item.profileSlug ?? '').toLowerCase()
      return item.displayName.toLowerCase().includes(q) || slug.includes(q)
    })
  }, [items, query, filter])

  const registryRows = useMemo(() => {
    const selfId = user?.id ?? ''
    return registryHits.filter((h) => h.id && h.id !== selfId)
  }, [registryHits, user?.id])

  const contactByUserId = useMemo(() => {
    const m = new Map<string, ContactCard>()
    for (const it of items) m.set(it.targetUserId, it)
    return m
  }, [items])

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

  const toggleFavoriteForSearchHit = async (hit: RegisteredUserSearchHit) => {
    const existing = contactByUserId.get(hit.id)
    if (existing) {
      await toggleFavorite(existing)
      return
    }
    if (busyTarget) return
    setBusyTarget(hit.id)
    const result = await setUserFavorite(hit.id, true)
    setBusyTarget(null)
    if (result.error || !result.data) {
      setError(result.error ?? 'Не удалось добавить в избранное')
      return
    }
    setError(null)
    silentReloadContacts()
  }

  return (
    <DashboardShell active="friends" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section dashboard-friends-page">
        <div className="dashboard-chat-page__head dashboard-friends-page__head">
          <Link
            to="/dashboard"
            className="dashboard-page-back"
            title="Назад в кабинет"
            aria-label="Назад в кабинет"
          >
            <ChevronLeftIcon />
            <span>Кабинет</span>
          </Link>
          <h2 className="dashboard-section__title dashboard-friends__page-title">Друзья и избранные</h2>
        </div>

        <div className="dashboard-chat-filters">
          <label className="dashboard-chat-filters__search">
            <span className="dashboard-chat-filters__label">Поиск</span>
            <input
              type="search"
              className="dashboard-chat-filters__input"
              placeholder="Имя, @slug или email (от 2 симв. — глобальный поиск)"
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

        {!loading && query.trim().length >= 2 ? (
          <div className="dashboard-friends-registry" aria-live="polite">
            <h3 className="dashboard-friends-registry__title">Найденные пользователи</h3>
            {registryLoading ? <div className="auth-loading auth-loading--inline" aria-label="Поиск..." /> : null}
            {!registryLoading && registryError ? <p className="join-error">{registryError}</p> : null}
            {!registryLoading && !registryError && registryRows.length === 0 ? (
              <p className="dashboard-friends-registry__empty">Никого не нашли по этому запросу.</p>
            ) : null}
            {!registryLoading && !registryError && registryRows.length > 0 ? (
              <div className="dashboard-friends-list dashboard-friends-list--registry">
                {registryRows.map((hit) => {
                  const linked = contactByUserId.get(hit.id)
                  const fav = linked?.isFavorite ?? false
                  return (
                    <article key={hit.id} className="dashboard-friend-card">
                      <div className="dashboard-friend-card__main">
                        <button
                          type="button"
                          className="dashboard-friend-card__avatar"
                          aria-label={`Профиль: ${hit.displayName}`}
                          onClick={() =>
                            openUserPeek({
                              userId: hit.id,
                              displayName: hit.displayName,
                              avatarUrl: hit.avatarUrl,
                            })
                          }
                        >
                          {hit.avatarUrl ? (
                            <img src={hit.avatarUrl} alt={hit.displayName} />
                          ) : (
                            <span>{hit.displayName.charAt(0).toUpperCase()}</span>
                          )}
                        </button>
                        <div className="dashboard-friend-card__text">
                          <div className="dashboard-friend-card__titleline">
                            <span className="dashboard-friend-card__name">{hit.displayName}</span>
                          </div>
                          {hit.profileSlug ? (
                            <div className="dashboard-friend-card__slug">@{hit.profileSlug}</div>
                          ) : null}
                          {linked ? (
                            <div className="dashboard-friend-card__meta">
                              <span>{linked.isFriend ? 'Друзья' : linked.favorsMe ? 'Добавил вас' : 'Контакт'}</span>
                            </div>
                          ) : (
                            <div className="dashboard-friend-card__meta">
                              <span>Не в вашем списке контактов</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="dashboard-friend-card__actions">
                        <button
                          type="button"
                          className={`dashboard-friend-card__fav-btn${fav ? ' dashboard-friend-card__fav-btn--active' : ''}`}
                          onClick={() => void toggleFavoriteForSearchHit(hit)}
                          disabled={busyTarget === hit.id}
                          title={fav ? 'Убрать из избранного' : 'В избранное'}
                        >
                          <StarIcon filled={fav} />
                          <span>{fav ? 'Убрать из избранного' : 'В избранное'}</span>
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}
        {!loading && !error && filtered.length === 0 ? (
          <div className="dashboard-chats-empty">
            {filter === 'friends'
              ? 'Пока нет взаимных друзей. Добавьте человека в избранное из чата комнаты или мессенджера — когда он ответит взаимностью, вы появитесь друг у друга здесь.'
              : filter === 'favorites'
                ? 'В избранном пока никого. Добавляйте людей из чата комнаты, мессенджера или найдите по имени и slug во вкладке «Друзья».'
                : filter === 'incoming'
                  ? 'Пока никто не добавил вас в избранное.'
                  : 'Пока здесь пусто. Добавляйте в избранное из чата комнаты, мессенджера или найдите пользователя поиском выше (от 2 символов).'}
          </div>
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <div className="dashboard-friends-list">
            {filtered.map((item) => (
              <article key={item.targetUserId} className="dashboard-friend-card">
                <div className="dashboard-friend-card__main">
                  <button
                    type="button"
                    className="dashboard-friend-card__avatar"
                    aria-label={`Профиль: ${item.displayName}`}
                    onClick={() =>
                      openUserPeek({
                        userId: item.targetUserId,
                        displayName: item.displayName,
                        avatarUrl: item.avatarUrl,
                      })
                    }
                  >
                    {item.avatarUrl ? (
                      <img src={item.avatarUrl} alt={item.displayName} />
                    ) : (
                      <span>{item.displayName.charAt(0).toUpperCase()}</span>
                    )}
                  </button>
                  <div className="dashboard-friend-card__text">
                    <div className="dashboard-friend-card__titleline">
                      <span className="dashboard-friend-card__name">{item.displayName}</span>
                      <span className={`dashboard-badge ${item.isFriend ? 'dashboard-badge--active' : 'dashboard-badge--pending'}`}>
                        {statusLabel(item)}
                      </span>
                    </div>
                    {item.profileSlug ? (
                      <div className="dashboard-friend-card__slug">@{item.profileSlug}</div>
                    ) : null}
                    {item.favorsMe && !item.isFavorite ? (
                      <div className="dashboard-friend-card__reciprocal">
                        <p className="dashboard-friend-card__reciprocal-text">
                          <strong>{item.displayName}</strong> добавил вас в избранное. Ответьте ему тем же?
                        </p>
                        <button
                          type="button"
                          className="dashboard-friend-card__reciprocal-add"
                          disabled={busyTarget === item.targetUserId}
                          onClick={() => void toggleFavorite(item)}
                        >
                          Добавить
                        </button>
                      </div>
                    ) : (
                      <div className="dashboard-friend-card__meta">
                        <span>{item.isFavorite ? 'У вас в избранном' : 'Не в избранном'}</span>
                        <span>{item.favorsMe ? 'Добавил вас' : 'Ещё не добавил вас'}</span>
                      </div>
                    )}
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
