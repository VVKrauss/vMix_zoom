import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { useProfile } from '../hooks/useProfile'
import { APP_VERSION } from '../config/version'
import { fetchAppVersion } from '../lib/appVersion'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { newRoomId } from '../utils/roomId'
import { ChatBubbleIcon, DashboardIcon } from './icons'

const ALPHA_TOOLTIP =
  'Сейчас проект работает в тестовом режиме. После окончания тестового периода могут измениться уровни доступа к функциям.'

export function HomePage() {
  const navigate = useNavigate()
  const { user, loading, signOut } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const { profile } = useProfile()
  const messengerUnreadCount = useMessengerUnreadCount()
  const [joinId, setJoinId] = useState('')
  const [dbVersion, setDbVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchAppVersion().then((v) => {
      if (cancelled) return
      setDbVersion(v)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const handleCreateClick = () => {
    if (!user) return
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
    (profile?.display_name as string | undefined) ??
    ((user as any)?.displayName as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Пользователь'

  const avatarUrl = (profile?.avatar_url as string | undefined) ?? undefined

  return (
    <div className="join-screen join-screen--themed">
      <div className="join-home-stack">
        <div className="join-card join-card--home">
          <div className="home-alpha-corner-wrap">
          <Link
            to="/news"
            className="theme-toggle home-alpha-corner-btn"
            aria-label="Новости и статус тестовой сборки"
          >
            <span className="home-alpha-corner-btn__glyph" aria-hidden>
              α
            </span>
          </Link>
          <div className="home-alpha-corner-tooltip" role="tooltip">
            {ALPHA_TOOLTIP}
          </div>
          </div>

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
                <Link to="/auth/forgot-password" className="home-auth-links__forgot">
                  Забыли пароль?
                </Link>
              </div>
            )}
          </div>
        ) : null}

        <div className="home-create-block">
          <button
            type="button"
            className="join-btn join-btn--block"
            onClick={handleCreateClick}
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

        <p className="home-version" aria-label={`Версия приложения: ${dbVersion ?? APP_VERSION}`}>
          {dbVersion ?? APP_VERSION}
        </p>
      </div>
    </div>
  )
}
