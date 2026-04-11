import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { newRoomId } from '../utils/roomId'
import { AdminPanelIcon, ChatBubbleIcon, DashboardIcon, ParticipantsBadgeIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

type DashboardShellTab = 'cabinet' | 'chats' | 'messenger' | 'friends'

type DashboardShellProps = {
  active: DashboardShellTab
  canAccessAdmin: boolean
  onSignOut: () => void
  children: ReactNode
}

const SIDEBAR_TAB_HINTS = {
  cabinet:
    'Профиль и тариф. Настройки комнаты: вид по умолчанию, кнопка смены раскладки и отображение камеры в плитках на десктопе; на телефоне — отдельная мобильная логика.',
  chats:
    'Здесь хранятся архивы комнатных чатов. Видны только беседы тех комнат, в которых вы были участником под своим аккаунтом.',
  messenger:
    'Постоянные личные переписки. Для старта уже есть чат с самим собой, который можно использовать как заметки.',
  friends:
    'Если вы добавили пользователя в избранные и он сделал то же самое, вы становитесь друзьями.',
} as const

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

export function DashboardShell({ active, canAccessAdmin, onSignOut, children }: DashboardShellProps) {
  const navigate = useNavigate()
  const unreadCount = useMessengerUnreadCount()

  const goCreateRoom = () => {
    const id = newRoomId()
    setPendingHostClaim(id)
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  return (
    <div className="dashboard-page">
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
            className="dashboard-topbar__action dashboard-topbar__action--primary"
            onClick={goCreateRoom}
          >
            Новая комната
          </button>
          <button type="button" className="dashboard-topbar__action" onClick={onSignOut}>
            Выход
          </button>
        </div>
      </header>

      <div className="dashboard-shell">
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
              label="Чаты"
              shortLabel="ЧТ"
              hint={SIDEBAR_TAB_HINTS.chats}
            >
              <ChatBubbleIcon />
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
