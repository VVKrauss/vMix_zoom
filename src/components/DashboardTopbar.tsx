import { Link, useNavigate } from 'react-router-dom'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { newRoomId } from '../utils/roomId'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { ChatBubbleIcon } from './icons'

type DashboardTopbarProps = {
  canAccessAdmin: boolean
  onSignOut: () => void
  active?: 'cabinet' | 'chats'
}

export function DashboardTopbar({ canAccessAdmin, onSignOut, active = 'cabinet' }: DashboardTopbarProps) {
  const navigate = useNavigate()
  const messengerUnread = useMessengerUnreadCount()

  const goCreateRoom = () => {
    const id = newRoomId()
    setPendingHostClaim(id)
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  return (
    <>
    <header className="dashboard-topbar">
      <Link to="/" className="dashboard-topbar__logo" title="На главную">
        <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
      </Link>
      <nav className="dashboard-topbar__nav">
        <Link to="/" className="dashboard-topbar__nav-link">
          На главную
        </Link>
        <button
          type="button"
          className="dashboard-topbar__nav-link dashboard-topbar__nav-link--btn"
          onClick={goCreateRoom}
        >
          Создать комнату
        </button>
        <Link
          to="/dashboard"
          className={`dashboard-topbar__nav-link${active === 'cabinet' ? ' dashboard-topbar__nav-link--active' : ''}`}
        >
          Кабинет
        </Link>
        <Link
          to="/dashboard/chats"
          className={`dashboard-topbar__nav-link${active === 'chats' ? ' dashboard-topbar__nav-link--active' : ''}`}
        >
          Комнаты
        </Link>
        <Link
          to="/dashboard/messenger"
          className="dashboard-topbar__nav-link dashboard-topbar__nav-link--inline-icon"
          title="Мессенджер"
        >
          <ChatBubbleIcon />
          <span>Мессенджер</span>
          {messengerUnread > 0 ? (
            <span className="dashboard-topbar__nav-ms-badge">
              {messengerUnread > 99 ? '99+' : messengerUnread}
            </span>
          ) : null}
        </Link>
        {canAccessAdmin ? (
          <Link to="/admin" className="dashboard-topbar__nav-link">
            Админка
          </Link>
        ) : null}
        <button
          type="button"
          className="dashboard-topbar__nav-link dashboard-topbar__nav-link--btn"
          onClick={onSignOut}
        >
          Выйти
        </button>
      </nav>
    </header>
    </>
  )
}
