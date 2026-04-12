import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { listMyContacts } from '../lib/socialGraph'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { newRoomId } from '../utils/roomId'
import {
  AdminPanelIcon,
  ChatBubbleIcon,
  DashboardIcon,
  LogOutIcon,
  ParticipantsBadgeIcon,
  PlusIcon,
  RoomsIcon,
} from './icons'
import { ThemeToggle } from './ThemeToggle'

type DashboardShellTab = 'cabinet' | 'chats' | 'messenger' | 'friends'

type DashboardShellProps = {
  active: DashboardShellTab
  canAccessAdmin: boolean
  onSignOut: () => void
  children: ReactNode
  /** Мобильный мессенджер: без топбара и вкладок — навигация в FAB на странице. */
  chromeless?: boolean
  /** Доп. элементы в правой части шапки (например, переключатель звука на странице мессенджера). */
  headerExtra?: ReactNode
}

const SIDEBAR_TAB_HINTS = {
  cabinet:
    'Профиль и тариф. Настройки комнаты: вид по умолчанию, кнопка смены раскладки и отображение камеры в плитках на десктопе; на телефоне — отдельная мобильная логика.',
  chats:
    'Архивы чатов комнат: беседы тех комнат, в которых вы были участником под своим аккаунтом.',
  messenger:
    'Постоянные личные переписки. Для старта уже есть чат с самим собой, который можно использовать как заметки.',
  friends:
    'Если вы добавили пользователя в избранные и он сделал то же самое, вы становитесь друзьями.',
} as const

const INCOMING_FAVORITES_BANNER_DISMISS_PREFIX = 'vmix.dashboard.incomingFav.dismissSig:'

function incomingFavDismissStorageKey(userId: string): string {
  return `${INCOMING_FAVORITES_BANNER_DISMISS_PREFIX}${userId}`
}

function incomingFavoritesSignature(ids: string[]): string {
  return [...ids].sort().join('|')
}

function DashboardSidebarLink({
  to,
  active,
  label,
  shortLabel,
  hint,
  children,
}: {
  to: string
  active: boolean
  label: string
  shortLabel: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`dashboard-sidebar__link${active ? ' dashboard-sidebar__link--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={hint}
    >
      <span className="dashboard-sidebar__icon" aria-hidden>
        {children}
      </span>
      <span className="dashboard-sidebar__label">{label}</span>
      <span className="dashboard-sidebar__label-short">{shortLabel}</span>
    </Link>
  )
}

export function DashboardShell({
  active,
  canAccessAdmin,
  onSignOut,
  children,
  chromeless,
  headerExtra,
}: DashboardShellProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const unreadCount = useMessengerUnreadCount()
  const [incomingFavSig, setIncomingFavSig] = useState<string | null>(null)
  const [dismissedIncomingFavSig, setDismissedIncomingFavSig] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) {
      setDismissedIncomingFavSig(null)
      return
    }
    try {
      setDismissedIncomingFavSig(localStorage.getItem(incomingFavDismissStorageKey(user.id)))
    } catch {
      setDismissedIncomingFavSig(null)
    }
  }, [user?.id])

  const refreshIncomingFavoritesSig = useCallback(() => {
    if (!user?.id) {
      setIncomingFavSig(null)
      return
    }
    void listMyContacts().then((res) => {
      if (res.error || !res.data) {
        setIncomingFavSig('')
        return
      }
      const ids = res.data.filter((c) => c.favorsMe && !c.isFavorite).map((c) => c.targetUserId)
      setIncomingFavSig(incomingFavoritesSignature(ids))
    })
  }, [user?.id])

  useEffect(() => {
    refreshIncomingFavoritesSig()
  }, [refreshIncomingFavoritesSig])

  useEffect(() => {
    if (!user?.id) return
    const onFocus = () => {
      refreshIncomingFavoritesSig()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user?.id, refreshIncomingFavoritesSig])

  const showIncomingFavoritesBanner =
    Boolean(user?.id) &&
    incomingFavSig !== null &&
    incomingFavSig !== '' &&
    incomingFavSig !== dismissedIncomingFavSig

  const dismissIncomingFavoritesBanner = () => {
    if (!incomingFavSig || !user?.id) return
    try {
      localStorage.setItem(incomingFavDismissStorageKey(user.id), incomingFavSig)
    } catch {
      /* ignore quota / private mode */
    }
    setDismissedIncomingFavSig(incomingFavSig)
  }

  const goCreateRoom = () => {
    const id = newRoomId()
    setPendingHostClaim(id)
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  return (
    <div className={`dashboard-page${chromeless ? ' dashboard-page--messenger-chromeless' : ''}`}>
      <header className="dashboard-topbar">
        <div className="dashboard-topbar__start">
          <Link to="/" className="dashboard-topbar__logo" title="На главную">
            <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
          </Link>
          {canAccessAdmin ? (
            <Link to="/admin" className="dashboard-topbar__admin" title="Админка" aria-label="Админка">
              <AdminPanelIcon />
            </Link>
          ) : null}
        </div>

        <div className="dashboard-topbar__actions">
          {headerExtra}
          <ThemeToggle variant="inline" className="theme-toggle--dashboard" />
          <Link
            to="/dashboard/messenger"
            className="dashboard-topbar__messenger"
            title={SIDEBAR_TAB_HINTS.messenger}
          >
            <ChatBubbleIcon />
            {unreadCount > 0 ? (
              <span className="dashboard-topbar__messenger-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className="dashboard-topbar__circle-action dashboard-topbar__circle-action--primary"
            onClick={goCreateRoom}
            title="Новая комната"
            aria-label="Новая комната"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="dashboard-topbar__circle-action"
            onClick={onSignOut}
            title="Выход"
            aria-label="Выход"
          >
            <LogOutIcon />
          </button>
        </div>
      </header>

      <div
        className={`dashboard-shell${showIncomingFavoritesBanner ? ' dashboard-shell--with-banner' : ''}`}
      >
        {showIncomingFavoritesBanner ? (
          <div className="dashboard-incoming-fav-banner" role="status" aria-live="polite">
            <p className="dashboard-incoming-fav-banner__text">
              Вас добавили в избранное. Вы можете добавить этого человека в избранное у себя — тогда вы станете
              друзьями.
            </p>
            <div className="dashboard-incoming-fav-banner__actions">
              <Link to="/dashboard/friends" className="dashboard-incoming-fav-banner__link">
                К разделу «Друзья»
              </Link>
              <button
                type="button"
                className="dashboard-incoming-fav-banner__dismiss"
                onClick={dismissIncomingFavoritesBanner}
              >
                Скрыть
              </button>
            </div>
          </div>
        ) : null}
        <aside className="dashboard-sidebar" aria-label="Разделы кабинета">
          <nav className="dashboard-sidebar__nav">
            <DashboardSidebarLink
              to="/dashboard"
              active={active === 'cabinet'}
              label="Кабинет"
              shortLabel="КБ"
              hint={SIDEBAR_TAB_HINTS.cabinet}
            >
              <DashboardIcon />
            </DashboardSidebarLink>
            <DashboardSidebarLink
              to="/dashboard/chats"
              active={active === 'chats'}
              label="Комнаты"
              shortLabel="КМ"
              hint={SIDEBAR_TAB_HINTS.chats}
            >
              <RoomsIcon />
            </DashboardSidebarLink>
            <DashboardSidebarLink
              to="/dashboard/messenger"
              active={active === 'messenger'}
              label="Мессенджер"
              shortLabel="МС"
              hint={SIDEBAR_TAB_HINTS.messenger}
            >
              <span className="dashboard-sidebar__icon-badge-wrap">
                <ChatBubbleIcon />
                {unreadCount > 0 ? <span className="dashboard-sidebar__badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
              </span>
            </DashboardSidebarLink>
            <DashboardSidebarLink
              to="/dashboard/friends"
              active={active === 'friends'}
              label="Друзья"
              shortLabel="ДР"
              hint={SIDEBAR_TAB_HINTS.friends}
            >
              <ParticipantsBadgeIcon />
            </DashboardSidebarLink>
          </nav>
        </aside>

        <main className="dashboard-body">
          <div className="dashboard-content dashboard-content--cabinet">{children}</div>
        </main>
      </div>

    </div>
  )
}
