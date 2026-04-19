import { Link } from 'react-router-dom'
import {
  AdminPanelIcon,
  DashboardIcon,
  FiRrIcon,
  HomeIcon,
  LogOutIcon,
  ParticipantsBadgeIcon,
  RoomsIcon,
} from '../icons'

export function MessengerQuickNavMenu(props: {
  open: boolean
  onBackdropClick: () => void
  onClose: () => void
  goCreateRoomFromMenu: () => void
  /** Явное обновление дерева чатов и аватарок (десктоп, меню «⋯»). */
  onRefreshChats?: () => void | Promise<void>
  onOpenMessengerSettings: () => void
  onSignOut: () => void | Promise<void>
  canAccessAdmin: boolean
}) {
  const {
    open,
    onBackdropClick,
    onClose,
    goCreateRoomFromMenu,
    onRefreshChats,
    onOpenMessengerSettings,
    onSignOut,
    canAccessAdmin,
  } = props
  if (!open) return null
  return (
    <>
      <div
        className={`dashboard-messenger-quick-menu-backdrop${
          open ? ' dashboard-messenger-quick-menu-backdrop--open' : ''
        }`}
        aria-hidden={!open}
        onClick={onBackdropClick}
      />
      <nav
        className={`dashboard-messenger-quick-menu${
          open ? ' dashboard-messenger-quick-menu--open' : ''
        } dashboard-messenger-quick-menu--anchor-head`}
        aria-hidden={!open}
        aria-label="Навигация"
      >
        <div className="dashboard-messenger-quick-menu__grid" role="toolbar">
          <Link to="/" className="dashboard-messenger-quick-menu__btn" onClick={onClose}>
            <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
              <HomeIcon />
            </span>
            <span className="dashboard-messenger-quick-menu__lbl">Главная</span>
          </Link>
          <Link to="/dashboard" className="dashboard-messenger-quick-menu__btn" onClick={onClose}>
            <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
              <DashboardIcon />
            </span>
            <span className="dashboard-messenger-quick-menu__lbl">Кабинет</span>
          </Link>
          <Link to="/dashboard/chats" className="dashboard-messenger-quick-menu__btn" onClick={onClose}>
            <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
              <RoomsIcon />
            </span>
            <span className="dashboard-messenger-quick-menu__lbl">Комнаты</span>
          </Link>
          <Link to="/dashboard/contacts" className="dashboard-messenger-quick-menu__btn" onClick={onClose}>
            <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
              <ParticipantsBadgeIcon />
            </span>
            <span className="dashboard-messenger-quick-menu__lbl">Контакты</span>
          </Link>
          <button type="button" className="dashboard-messenger-quick-menu__btn" onClick={goCreateRoomFromMenu}>
            <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
              <FiRrIcon name="circle-phone" />
            </span>
            <span className="dashboard-messenger-quick-menu__lbl">Новая комната</span>
          </button>
          {onRefreshChats ? (
            <button
              type="button"
              className="dashboard-messenger-quick-menu__btn"
              onClick={() => {
                onClose()
                void onRefreshChats()
              }}
              title="Обновить список чатов и превью аватарок"
              aria-label="Обновить список чатов"
            >
              <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                <FiRrIcon name="rotate-right" />
              </span>
              <span className="dashboard-messenger-quick-menu__lbl">Обновить чаты</span>
            </button>
          ) : null}
          <button
            type="button"
            className="dashboard-messenger-quick-menu__btn"
            onClick={() => {
              onClose()
              onOpenMessengerSettings()
            }}
            title="Настройки мессенджера"
            aria-label="Настройки мессенджера"
          >
            <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
              <FiRrIcon name="settings" />
            </span>
            <span className="dashboard-messenger-quick-menu__lbl">Настройки</span>
          </button>
          {canAccessAdmin ? (
            <Link to="/admin" className="dashboard-messenger-quick-menu__btn" onClick={onClose}>
              <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                <AdminPanelIcon />
              </span>
              <span className="dashboard-messenger-quick-menu__lbl">Админка</span>
            </Link>
          ) : null}
          <button
            type="button"
            className="dashboard-messenger-quick-menu__btn dashboard-messenger-quick-menu__btn--danger dashboard-messenger-quick-menu__btn--span"
            onClick={() => {
              onClose()
              void onSignOut()
            }}
          >
            <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
              <LogOutIcon />
            </span>
            <span className="dashboard-messenger-quick-menu__lbl">Выход</span>
          </button>
        </div>
      </nav>
    </>
  )
}
