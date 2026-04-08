import { FormEvent, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { newRoomId } from '../utils/roomId'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { DashboardIcon } from './icons'

export function HomePage() {
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
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

  const displayName = user?.user_metadata?.display_name as string | undefined
    ?? user?.email?.split('@')[0]
    ?? 'Пользователь'

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  return (
    <div className="join-screen">
      <div className="join-card join-card--home">

        {/* Логотип */}
        <div className="join-logo-static" aria-hidden>
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </div>

        {/* Блок авторизации / приветствия */}
        {!loading && (
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
                  <Link to="/dashboard" className="join-btn join-btn--secondary join-btn--block home-user-nav__btn">
                    Личный кабинет
                  </Link>
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
        )}

        {/* Создать комнату */}
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
          {!user && !loading && (
            <p className="home-create-hint">
              🔒 Требуется аккаунт
            </p>
          )}
        </div>

        {/* Разделитель */}
        <div className="home-divider">
          <span>или войдите в существующую</span>
        </div>

        {/* Войти по ID */}
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
          <button
            className="join-btn join-btn--secondary join-btn--block"
            type="submit"
            disabled={!joinId.trim()}
          >
            Перейти в комнату
          </button>
        </form>

      </div>
    </div>
  )
}
