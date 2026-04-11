import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { newRoomId } from '../utils/roomId'
import { ChatBubbleIcon, DashboardIcon } from './icons'
import { ThemeToggle } from './ThemeToggle'

export function HomePage() {
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const messengerUnreadCount = useMessengerUnreadCount()
  const [joinId, setJoinId] = useState('')

  const handleCreate = () => {
    const id = newRoomId()
    setPendingHostClaim(id)
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (!id) return
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  const displayName =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Пользователь'

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  return (
    <div className="join-screen join-screen--themed">
      <ThemeToggle variant="inline" className="theme-toggle--join-corner" />
      <div className="join-card join-card--home">
        <div className="join-logo-static" aria-hidden>
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </div>

        {!loading ? (
          <div className="home-auth-block">
            {user ? (
              <div className="home-user-block">
                <div className="home-user-identity">
                  <div className="home-user-identity__avatar-wrap" aria-hidden>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="home-user-identity__avatar" draggable={false} />
                    ) : (
                      <span className="home-user-identity__avatar home-user-identity__avatar--placeholder">
                        <DashboardIcon />
                      </span>
                    )}
                  </div>
                  <p className="home-user-identity__name" title={displayName}>
                    {displayName}
                  </p>
                </div>

                <nav className="home-user-nav" aria-label="Разделы аккаунта">
                  <div className="home-user-nav__row">
                    <Link to="/dashboard" className="join-btn join-btn--secondary join-btn--block home-user-nav__btn">
                      Личный кабинет
                    </Link>
                    <Link
                      to="/dashboard/messenger"
                      className="home-user-nav__icon-btn"
                      title="Мессенджер"
                      aria-label="Мессенджер"
                    >
                      <ChatBubbleIcon />
                      {messengerUnreadCount > 0 ? (
                        <span className="home-user-nav__icon-badge">
                          {messengerUnreadCount > 99 ? '99+' : messengerUnreadCount}
                        </span>
                      ) : null}
                    </Link>
                  </div>

                  {canAccessAdmin ? (
                    <Link to="/admin" className="join-btn join-btn--secondary join-btn--block home-user-nav__btn">
                      Войти в админку
                    </Link>
                  ) : null}
                </nav>

                <button type="button" className="home-user-signout" onClick={() => signOut()}>
                  Выйти
                </button>
              </div>
            ) : (
              <div className="home-auth-links">
                <Link to="/login" className="join-btn join-btn--block home-auth-links__btn">
                  Войти
                </Link>
                <Link
                  to="/login?mode=register"
                  className="join-btn join-btn--secondary join-btn--block home-auth-links__btn"
                >
                  Зарегистрироваться
                </Link>
              </div>
            )}
          </div>
        ) : null}

        <div className="home-create-block">
          <button
            type="button"
            className="join-btn join-btn--block"
            onClick={handleCreate}
            disabled={!user}
            title={!user ? 'Войдите, чтобы создать комнату' : undefined}
          >
            Создать комнату
          </button>
          {!user && !loading ? <p className="home-create-hint">Требуется аккаунт</p> : null}
        </div>

        <div className="home-divider">
          <span>или войдите в существующую</span>
        </div>

        <form onSubmit={handleJoinSubmit} className="join-form">
          <label className="join-label">ID комнаты</label>
          <input
            className="join-input"
            type="text"
            placeholder="Введите ID комнаты"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            autoComplete="off"
            maxLength={200}
          />
          <button className="join-btn join-btn--secondary join-btn--block" type="submit" disabled={!joinId.trim()}>
            Перейти в комнату
          </button>
        </form>
      </div>
    </div>
  )
}
