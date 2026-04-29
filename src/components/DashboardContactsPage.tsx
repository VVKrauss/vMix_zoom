import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  type ContactCard,
  type RegisteredUserSearchHit,
  hideContactFromMyList,
  listMyContacts,
  searchRegisteredUsers,
  setContactPin,
  setUserBlocked,
} from '../lib/socialGraph'
import { DashboardMenuPicker, type DashboardMenuOption } from './DashboardMenuPicker'
import { DashboardShell } from './DashboardShell'
import { ChatBubbleIcon, ChevronLeftIcon, FiRrIcon, StarIcon, TrashIcon } from './icons'

type ContactFilter = 'all' | 'mutual' | 'pinned' | 'incoming' | 'blocked'

const CONTACT_FILTER_OPTIONS: DashboardMenuOption<ContactFilter>[] = [
  { value: 'all', label: 'Все' },
  { value: 'mutual', label: 'Взаимные' },
  { value: 'pinned', label: 'В контактах' },
  { value: 'incoming', label: 'Добавили вас' },
  { value: 'blocked', label: 'Заблокированные' },
]

function matchesContactFilter(item: ContactCard, filter: ContactFilter): boolean {
  if (filter === 'blocked') return item.blockedByMe
  if (filter === 'mutual') return item.isMutualContact
  if (filter === 'pinned') return item.pinnedByMe
  if (filter === 'incoming') return item.pinnedMe && !item.pinnedByMe
  return true
}

function statusLabel(item: ContactCard): string {
  if (item.blockedByMe) return 'Вы заблокировали'
  if (item.blockedMe) return 'Заблокировал вас'
  if (item.isMutualContact) return 'Взаимный контакт'
  if (item.pinnedByMe) return 'В ваших контактах'
  if (item.pinnedMe) return 'Добавил вас'
  return 'Контакт'
}

export function DashboardContactsPage() {
  const { signOut, user } = useAuth()
  const { openUserPeek } = useUserPeek()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ContactCard[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ContactFilter>('all')
  const [busyTarget, setBusyTarget] = useState<string | null>(null)
  const [hideBusy, setHideBusy] = useState<string | null>(null)
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
    let q = query.trim().toLowerCase()
    while (q.startsWith('@')) q = q.slice(1).trim()
    return items.filter((item) => {
      if (!matchesContactFilter(item, filter)) return false
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

  const togglePin = async (item: ContactCard) => {
    if (busyTarget) return
    const next = !item.pinnedByMe
    setBusyTarget(item.targetUserId)
    setItems((prev) =>
      prev.map((row) =>
        row.targetUserId === item.targetUserId
          ? {
              ...row,
              pinnedByMe: next,
              isMutualContact: next && row.pinnedMe,
            }
          : row,
      ),
    )
    const result = await setContactPin(item.targetUserId, next)
    setBusyTarget(null)
    if (result.error || !result.data) {
      setItems((prev) => prev.map((row) => (row.targetUserId === item.targetUserId ? item : row)))
      setError(result.error ?? 'Не удалось обновить контакт')
      return
    }
    setError(null)
    setItems((prev) =>
      prev.map((row) =>
        row.targetUserId === item.targetUserId
          ? {
              ...row,
              pinnedByMe: result.data!.pinnedByMe,
              pinnedMe: result.data!.pinnedMe,
              isMutualContact: result.data!.isMutualContact,
              blockedByMe: result.data!.blockedByMe,
              blockedMe: result.data!.blockedMe,
            }
          : row,
      ),
    )
  }

  const togglePinForSearchHit = async (hit: RegisteredUserSearchHit) => {
    const existing = contactByUserId.get(hit.id)
    if (existing) {
      await togglePin(existing)
      return
    }
    if (busyTarget) return
    setBusyTarget(hit.id)
    const result = await setContactPin(hit.id, true)
    setBusyTarget(null)
    if (result.error || !result.data) {
      setError(result.error ?? 'Не удалось добавить в контакты')
      return
    }
    setError(null)
    silentReloadContacts()
  }

  const toggleBlock = async (item: ContactCard) => {
    if (busyTarget) return
    const next = !item.blockedByMe
    setBusyTarget(item.targetUserId)
    const res = await setUserBlocked(item.targetUserId, next)
    setBusyTarget(null)
    if (res.error || !res.data) {
      setError(res.error ?? 'Не удалось обновить блокировку')
      return
    }
    setError(null)
    silentReloadContacts()
  }

  const hideFromList = async (targetUserId: string) => {
    if (hideBusy) return
    setHideBusy(targetUserId)
    const res = await hideContactFromMyList(targetUserId)
    setHideBusy(null)
    if (res.error) {
      setError(res.error)
      return
    }
    setError(null)
    silentReloadContacts()
  }

  const messengerUrl = (uid: string, title: string) => {
    const sp = new URLSearchParams()
    sp.set('with', uid)
    if (title.trim()) sp.set('title', title.trim())
    return `/dashboard/messenger?${sp.toString()}`
  }

  return (
    <DashboardShell active="contacts" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section dashboard-contacts-page">
        <div className="dashboard-chat-page__head dashboard-contacts-page__head">
          <Link
            to="/dashboard"
            className="join-back-arrow"
            title="Назад в кабинет"
            aria-label="Назад в кабинет"
          >
            <ChevronLeftIcon />
          </Link>
          <h2 className="dashboard-settings-back__title dashboard-contacts__page-title">Контакты</h2>
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
              options={CONTACT_FILTER_OPTIONS}
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
                  const pin = linked?.pinnedByMe ?? false
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
                              <span>
                                {linked.isMutualContact
                                  ? 'Взаимный контакт'
                                  : linked.pinnedMe
                                    ? 'Добавил вас в контакты'
                                    : 'Контакт'}
                              </span>
                            </div>
                          ) : (
                            <div className="dashboard-friend-card__meta">
                              <span>Не в вашем списке</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="dashboard-friend-card__actions">
                        <Link
                          className="dashboard-contact-msg-ico"
                          to={messengerUrl(hit.id, hit.displayName)}
                          title="Личный чат"
                          aria-label="Открыть личный чат"
                        >
                          <ChatBubbleIcon />
                        </Link>
                        <button
                          type="button"
                          className={`dashboard-friend-card__fav-btn${pin ? ' dashboard-friend-card__fav-btn--active' : ''}`}
                          onClick={() => void togglePinForSearchHit(hit)}
                          disabled={busyTarget === hit.id}
                          title={pin ? 'Убрать из контактов' : 'Добавить в контакты'}
                        >
                          <StarIcon filled={pin} />
                          <span>{pin ? 'В контактах' : 'В контакты'}</span>
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
            {filter === 'mutual'
              ? 'Пока нет взаимных контактов. Добавьте человека в контакты — когда он ответит взаимностью, вы появитесь здесь.'
              : filter === 'pinned'
                ? 'Пока нет контактов. Добавляйте людей из чата/мессенджера или найдите пользователя поиском (от 2 символов).'
                : filter === 'incoming'
                  ? 'Пока никто не добавил вас.'
                  : filter === 'blocked'
                    ? 'Пока нет заблокированных пользователей.'
                  : 'Пока здесь пусто. Добавляйте людей в контакты из чата или найдите пользователя поиском (от 2 символов).'}
          </div>
        ) : null}

        {!loading && !error && filtered.length > 0 ? (
          <ul className="dashboard-contact-compact-list">
            {filtered.map((item) => (
              <li key={item.targetUserId} className="dashboard-contact-compact-row">
                <button
                  type="button"
                  className="dashboard-contact-compact-row__avatar"
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
                    <img src={item.avatarUrl} alt="" />
                  ) : (
                    <span>{item.displayName.charAt(0).toUpperCase()}</span>
                  )}
                </button>
                <div className="dashboard-contact-compact-row__main">
                  <span className="dashboard-contact-compact-row__name">{item.displayName}</span>
                  <span
                    className={`dashboard-contact-compact-row__badge${
                      item.isMutualContact ? ' dashboard-contact-compact-row__badge--on' : ''
                    }`}
                  >
                    {statusLabel(item)}
                  </span>
                </div>
                <div className="dashboard-contact-compact-row__actions">
                  <Link
                    className="dashboard-contact-msg-ico"
                    to={messengerUrl(item.targetUserId, item.displayName)}
                    title="Личный чат"
                    aria-label="Открыть личный чат"
                  >
                    <ChatBubbleIcon />
                  </Link>
                  <button
                    type="button"
                    className={`dashboard-contact-compact-row__pin${item.pinnedByMe ? ' dashboard-contact-compact-row__pin--on' : ''}`}
                    disabled={busyTarget === item.targetUserId}
                    onClick={() => void togglePin(item)}
                    title={item.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты'}
                    aria-label={item.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты'}
                  >
                    <StarIcon filled={item.pinnedByMe} />
                  </button>
                  <button
                    type="button"
                    className={`dashboard-contact-compact-row__hide${item.blockedByMe ? ' dashboard-contact-compact-row__pin--on' : ''}`}
                    disabled={busyTarget === item.targetUserId}
                    onClick={() => void toggleBlock(item)}
                    title={item.blockedByMe ? 'Разблокировать' : 'Заблокировать'}
                    aria-label={item.blockedByMe ? 'Разблокировать' : 'Заблокировать'}
                  >
                    <FiRrIcon name={item.blockedByMe ? 'unlock' : 'ban'} />
                  </button>
                  <button
                    type="button"
                    className="dashboard-contact-compact-row__hide"
                    disabled={hideBusy === item.targetUserId}
                    onClick={() => void hideFromList(item.targetUserId)}
                    title="Скрыть из списка"
                    aria-label="Скрыть из списка контактов"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </DashboardShell>
  )
}
