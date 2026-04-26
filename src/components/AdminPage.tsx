import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { AdminDashboardPanel } from './AdminDashboardPanel'
import { AdminRegisteredUsersTable } from './AdminRegisteredUsersTable'
import { ServerSettingsModal } from './ServerSettingsModal'
import { TelegramNotificationsPanel } from './TelegramNotificationsPanel'
import { AdminRoomChatsCleanupPanel } from './AdminRoomChatsCleanupPanel'
import { AdminSiteNewsPanel } from './AdminSiteNewsPanel'
import { AdminPanelIcon, ChatBubbleIcon, HomeIcon, LogOutIcon, SettingsGearIcon, FiRrIcon } from './icons'
import { AdminVpsPanel } from './AdminVpsPanel'

type AdminTab = 'dashboard' | 'users' | 'videoServer' | 'vps' | 'notifications' | 'roomChats' | 'news'

export function AdminPage() {
  const { signOut } = useAuth()
  const { isSuperadmin } = useCanAccessAdminPanel()
  const messengerUnread = useMessengerUnreadCount()
  const [tab, setTab] = useState<AdminTab>('dashboard')

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <Link to="/" className="dashboard-topbar__logo" title="На главную">
          <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>
        <nav className="dashboard-topbar__nav">
          <Link to="/" className="dashboard-topbar__nav-link dashboard-topbar__nav-link--icon" title="На главную" aria-label="На главную">
            <HomeIcon />
            <span className="dashboard-topbar__nav-text">На главную</span>
          </Link>
          <Link to="/dashboard" className="dashboard-topbar__nav-link dashboard-topbar__nav-link--icon" title="Личный кабинет" aria-label="Личный кабинет">
            <SettingsGearIcon />
            <span className="dashboard-topbar__nav-text">Кабинет</span>
          </Link>
          <Link
            to="/dashboard/messenger"
            className="dashboard-topbar__nav-link dashboard-topbar__nav-link--icon"
            title="Мессенджер"
            aria-label="Мессенджер"
          >
            <ChatBubbleIcon />
            <span className="dashboard-topbar__nav-text">Мессенджер</span>
            {messengerUnread > 0 ? (
              <span className="dashboard-topbar__nav-ms-badge">
                {messengerUnread > 99 ? '99+' : messengerUnread}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            className="dashboard-topbar__nav-link dashboard-topbar__nav-link--btn dashboard-topbar__nav-link--icon"
            onClick={() => signOut()}
            title="Выйти"
            aria-label="Выйти"
          >
            <LogOutIcon />
            <span className="dashboard-topbar__nav-text">Выйти</span>
          </button>
        </nav>
      </header>

      <div className="dashboard-body dashboard-body--admin">
        <aside className="admin-sidebar" aria-label="Разделы админки">
          <h1 className="admin-sidebar__title">Админка</h1>
          <nav className="admin-sidebar__nav">
            <button
              type="button"
              className={`admin-sidebar__link${tab === 'dashboard' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('dashboard')}
            >
              Дашборд
            </button>
            <button
              type="button"
              className={`admin-sidebar__link${tab === 'users' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('users')}
            >
              Пользователи
            </button>
            <button
              type="button"
              className={`admin-sidebar__link${tab === 'videoServer' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('videoServer')}
            >
              Сервер Видео
            </button>
            <button
              type="button"
              className={`admin-sidebar__link${tab === 'vps' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('vps')}
            >
              VPS
            </button>
            <button
              type="button"
              className={`admin-sidebar__link${tab === 'notifications' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('notifications')}
            >
              Telegram
            </button>
            <button
              type="button"
              className={`admin-sidebar__link${tab === 'news' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('news')}
            >
              Новости
            </button>
          </nav>
        </aside>

        <div className="admin-main">
          <nav className="admin-tabs" aria-label="Вкладки админки">
            <button
              type="button"
              className={`admin-tabs__tab${tab === 'dashboard' ? ' admin-tabs__tab--active' : ''}`}
              onClick={() => setTab('dashboard')}
              aria-label="Дашборд"
              title="Дашборд"
            >
              <FiRrIcon name="apps" />
              <span className="admin-tabs__text">Даш</span>
            </button>
            <button
              type="button"
              className={`admin-tabs__tab${tab === 'users' ? ' admin-tabs__tab--active' : ''}`}
              onClick={() => setTab('users')}
              aria-label="Пользователи"
              title="Пользователи"
            >
              <FiRrIcon name="users" />
              <span className="admin-tabs__text">Users</span>
            </button>
            <button
              type="button"
              className={`admin-tabs__tab${tab === 'videoServer' ? ' admin-tabs__tab--active' : ''}`}
              onClick={() => setTab('videoServer')}
              aria-label="Сервер видео"
              title="Сервер видео"
            >
              <FiRrIcon name="video-camera" />
              <span className="admin-tabs__text">Видео</span>
            </button>
            <button
              type="button"
              className={`admin-tabs__tab${tab === 'vps' ? ' admin-tabs__tab--active' : ''}`}
              onClick={() => setTab('vps')}
              aria-label="VPS"
              title="VPS"
            >
              <FiRrIcon name="server" />
              <span className="admin-tabs__text">VPS</span>
            </button>
            <button
              type="button"
              className={`admin-tabs__tab${tab === 'notifications' ? ' admin-tabs__tab--active' : ''}`}
              onClick={() => setTab('notifications')}
              aria-label="Telegram"
              title="Telegram"
            >
              <FiRrIcon name="bell" />
              <span className="admin-tabs__text">TG</span>
            </button>
            <button
              type="button"
              className={`admin-tabs__tab${tab === 'news' ? ' admin-tabs__tab--active' : ''}`}
              onClick={() => setTab('news')}
              aria-label="Новости"
              title="Новости"
            >
              <AdminPanelIcon />
              <span className="admin-tabs__text">News</span>
            </button>
          </nav>

          {tab === 'dashboard' ? <AdminDashboardPanel /> : null}

          {tab === 'users' ? (
            <section className="dashboard-section">
              <h2 className="dashboard-section__subtitle">Зарегистрированные пользователи</h2>
              <AdminRegisteredUsersTable isSuperadmin={isSuperadmin} />
            </section>
          ) : null}

          {tab === 'videoServer' ? <ServerSettingsModal variant="inline" open /> : null}

          {tab === 'vps' ? (
            <section className="dashboard-section">
              <h2 className="dashboard-section__subtitle">VPS</h2>
              <p className="dashboard-section__hint">
                Эта вкладка — про API/БД/прокси на VPS (не про signaling/vMix).
              </p>
              <AdminVpsPanel />
            </section>
          ) : null}

          {tab === 'notifications' ? <TelegramNotificationsPanel /> : null}

          {tab === 'roomChats' ? <AdminRoomChatsCleanupPanel /> : null}

          {tab === 'news' ? <AdminSiteNewsPanel /> : null}
        </div>
      </div>
    </div>
  )
}
