import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { newRoomId } from '../utils/roomId'
import { ChatBubbleIcon, DashboardIcon, ParticipantsBadgeIcon } from './icons'

type DashboardShellTab = 'cabinet' | 'chats' | 'friends'

type DashboardShellProps = {
  active: DashboardShellTab
  canAccessAdmin: boolean
  onSignOut: () => void
  children: ReactNode
}

function DashboardSidebarLink({
  to,
  active,
  label,
  shortLabel,
  children,
}: {
  to: string
  active: boolean
  label: string
  shortLabel: string
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`dashboard-sidebar__link${active ? ' dashboard-sidebar__link--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      title={label}
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

  const goCreateRoom = () => {
    const id = newRoomId()
    setPendingHostClaim(id)
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <Link to="/" className="dashboard-topbar__logo" title="На главную">
          <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>

        <div className="dashboard-topbar__actions">
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
            >
              <DashboardIcon />
            </DashboardSidebarLink>
            <DashboardSidebarLink
              to="/dashboard/chats"
              active={active === 'chats'}
              label="Чаты"
              shortLabel="ЧТ"
            >
              <ChatBubbleIcon />
            </DashboardSidebarLink>
            <DashboardSidebarLink
              to="/dashboard/friends"
              active={active === 'friends'}
              label="Друзья"
              shortLabel="ДР"
            >
              <ParticipantsBadgeIcon />
            </DashboardSidebarLink>
            {canAccessAdmin ? (
              <Link to="/admin" className="dashboard-sidebar__link" title="Админка">
                <span className="dashboard-sidebar__icon" aria-hidden>
                  <DashboardIcon />
                </span>
                <span className="dashboard-sidebar__label">Админка</span>
                <span className="dashboard-sidebar__label-short">АД</span>
              </Link>
            ) : null}
          </nav>
        </aside>

        <main className="dashboard-body">
          <div className="dashboard-content dashboard-content--cabinet">{children}</div>
        </main>
      </div>
    </div>
  )
}
