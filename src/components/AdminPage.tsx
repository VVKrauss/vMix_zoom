import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { AdminRegisteredUsersTable } from './AdminRegisteredUsersTable'
import { ServerSettingsModal } from './ServerSettingsModal'
import { AdminDashboardPanel } from './AdminDashboardPanel'

type AdminTab = 'dashboard' | 'users' | 'server'

export function AdminPage() {
  const { signOut } = useAuth()
  const { isSuperadmin } = useCanAccessAdminPanel()
  const [tab, setTab] = useState<AdminTab>('dashboard')

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <Link to="/" className="dashboard-topbar__logo" title="На главную">
          <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>
        <nav className="dashboard-topbar__nav">
          <Link to="/" className="dashboard-topbar__nav-link">
            На главную
          </Link>
          <Link to="/dashboard" className="dashboard-topbar__nav-link">
            Личный кабинет
          </Link>
          <button type="button" className="dashboard-topbar__nav-link dashboard-topbar__nav-link--btn" onClick={() => signOut()}>
            Выйти
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
              className={`admin-sidebar__link${tab === 'server' ? ' admin-sidebar__link--active' : ''}`}
              onClick={() => setTab('server')}
            >
              Сервер
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
        </div>
      </div>
    </div>
  )
}
