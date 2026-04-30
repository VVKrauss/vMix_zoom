import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { AdminDashboardPanel } from './AdminDashboardPanel'
import { AdminRegisteredUsersTable } from './AdminRegisteredUsersTable'
import { ServerSettingsModal } from './ServerSettingsModal'
import { TelegramNotificationsPanel } from './TelegramNotificationsPanel'
import { AdminRoomChatsCleanupPanel } from './AdminRoomChatsCleanupPanel'
import { AdminSiteNewsPanel } from './AdminSiteNewsPanel'
import { DashboardShell } from './DashboardShell'
import { LogOutIcon } from './icons'

type AdminTab = 'dashboard' | 'users' | 'server' | 'notifications' | 'roomChats' | 'news'

export function AdminPage() {
  const { signOut } = useAuth()
  const { allowed: canAccessAdmin, isSuperadmin } = useCanAccessAdminPanel()
  const [tab, setTab] = useState<AdminTab>('dashboard')

  return (
    <DashboardShell
      active="cabinet"
      canAccessAdmin={canAccessAdmin}
      onSignOut={() => signOut()}
      suppressBurger
      headerExtra={<div className="dashboard-topbar__fill" />}
      headerActionsExtra={
        <button
          type="button"
          className="dashboard-topbar__circle-action"
          onClick={() => signOut()}
          title="Выход"
          aria-label="Выход"
        >
          <LogOutIcon />
        </button>
      }
    >
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
              className={`admin-sidebar__link${tab === 'server' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('server')}
            >
              Сервер
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
          {tab === 'dashboard' ? <AdminDashboardPanel /> : null}

          {tab === 'users' ? (
            <section className="dashboard-section">
              <h2 className="dashboard-section__subtitle">Зарегистрированные пользователи</h2>
              <AdminRegisteredUsersTable isSuperadmin={isSuperadmin} />
            </section>
          ) : null}

          {tab === 'server' ? <ServerSettingsModal variant="inline" open /> : null}

          {tab === 'notifications' ? <TelegramNotificationsPanel /> : null}

          {tab === 'roomChats' ? <AdminRoomChatsCleanupPanel /> : null}

          {tab === 'news' ? <AdminSiteNewsPanel /> : null}
        </div>
      </div>
    </DashboardShell>
  )
}
