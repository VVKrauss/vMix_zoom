import type { ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { listMyContacts } from '../lib/socialGraph'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { newRoomId } from '../utils/roomId'
import {
  AdminPanelIcon,
  ChatBubbleIcon,
  FiRrIcon,
  LogOutIcon,
} from './icons'

type DashboardShellTab = 'cabinet' | 'chats' | 'messenger' | 'contacts'

type DashboardShellProps = {
  active: DashboardShellTab
  canAccessAdmin: boolean
  onSignOut: () => void
  children: ReactNode
  /** Мобильный мессенджер: без топбара и вкладок — навигация в FAB на странице. */
  chromeless?: boolean
  /** Скрыть бургер в шапке (для страниц с собственным меню). */
  suppressBurger?: boolean
  /** Доп. элементы в правой части шапки (например, переключатель звука на странице мессенджера). */
  headerExtra?: ReactNode
}

const INCOMING_PINS_BANNER_DISMISS_PREFIX = 'vmix.dashboard.incomingPin.dismissSig:'

function incomingPinDismissStorageKey(userId: string): string {
  return `${INCOMING_PINS_BANNER_DISMISS_PREFIX}${userId}`
}

function incomingPinsSignature(ids: string[]): string {
  return [...ids].sort().join('|')
}

export function DashboardShell({
  active,
  canAccessAdmin,
  onSignOut,
  children,
  chromeless,
  suppressBurger = false,
  headerExtra,
}: DashboardShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const unreadCount = useMessengerUnreadCount()
  const isMobileCabinetNav = useMediaQuery('(max-width: 900px)')
  /** Единая шапка, кроме раздела «Комнаты». */
  const unifiedCabinetNav = Boolean(!chromeless && active !== 'chats')
  /** Круглые кнопки мессенджер / новая комната / выход — только у «Комнаты» на десктопе. */
  const showCabinetQuickCircleActions = Boolean(!chromeless && active === 'chats' && !isMobileCabinetNav)
  const [incomingPinSig, setIncomingPinSig] = useState<string | null>(null)
  const [dismissedIncomingPinSig, setDismissedIncomingPinSig] = useState<string | null>(null)
  useEffect(() => {
    if (!user?.id) {
      setDismissedIncomingPinSig(null)
      return
    }
    try {
      setDismissedIncomingPinSig(localStorage.getItem(incomingPinDismissStorageKey(user.id)))
    } catch {
      setDismissedIncomingPinSig(null)
    }
  }, [user?.id])

  const refreshIncomingPinsSig = useCallback(() => {
    if (!user?.id) {
      setIncomingPinSig(null)
      return
    }
    void listMyContacts().then((res) => {
      if (res.error || !res.data) {
        setIncomingPinSig('')
        return
      }
      const ids = res.data.filter((c) => c.pinnedMe && !c.pinnedByMe).map((c) => c.targetUserId)
      setIncomingPinSig(incomingPinsSignature(ids))
    })
  }, [user?.id])

  useEffect(() => {
    refreshIncomingPinsSig()
  }, [refreshIncomingPinsSig])

  useEffect(() => {
    if (!user?.id) return
    const onFocus = () => {
      refreshIncomingPinsSig()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user?.id, refreshIncomingPinsSig])

  const showIncomingPinsBanner =
    Boolean(user?.id) &&
    incomingPinSig !== null &&
    incomingPinSig !== '' &&
    incomingPinSig !== dismissedIncomingPinSig

  const dismissIncomingPinsBanner = () => {
    if (!incomingPinSig || !user?.id) return
    try {
      localStorage.setItem(incomingPinDismissStorageKey(user.id), incomingPinSig)
    } catch {
      /* ignore quota / private mode */
    }
    setDismissedIncomingPinSig(incomingPinSig)
  }

  const goCreateRoom = () => {
    const id = newRoomId()
    setPendingHostClaim(id)
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  return (
    <div
      className={`dashboard-page${chromeless ? ' dashboard-page--messenger-chromeless' : ''}${
        !chromeless ? ' dashboard-page--cabinet-mobile-burger' : ''
      }${unifiedCabinetNav ? ' dashboard-page--unified-top-nav' : ''}`}
    >
      <header
        className={`dashboard-topbar${unifiedCabinetNav ? ' dashboard-topbar--unified' : ''}`}
      >
        <div className="dashboard-topbar__start">
          <Link to="/" className="dashboard-topbar__logo" title="На главную">
            <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
          </Link>
          {canAccessAdmin && showCabinetQuickCircleActions ? (
            <Link to="/admin" className="dashboard-topbar__admin" title="Админка" aria-label="Админка">
              <AdminPanelIcon />
            </Link>
          ) : null}
        </div>

        {unifiedCabinetNav ? (
          <div className="dashboard-topbar__fill">{headerExtra}</div>
        ) : null}

        <div className="dashboard-topbar__actions">
          {!unifiedCabinetNav ? headerExtra : null}
          {unifiedCabinetNav && active !== 'messenger' && !chromeless ? (
            <Link
              to="/dashboard/messenger"
              className="dashboard-topbar__messenger"
              title="Мессенджер"
              aria-label="Мессенджер"
            >
              <ChatBubbleIcon />
              {unreadCount > 0 ? (
                <span className="dashboard-topbar__messenger-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </Link>
          ) : null}
          {unifiedCabinetNav ? (
            <button
              type="button"
              className="dashboard-topbar__circle-action dashboard-topbar__circle-action--primary"
              onClick={goCreateRoom}
              title="Новая комната"
              aria-label="Новая комната"
            >
              <FiRrIcon name="circle-phone" className="dashboard-topbar__new-room-fi" />
            </button>
          ) : null}
          {showCabinetQuickCircleActions ? (
            <>
              <Link
                to="/dashboard/messenger"
                className="dashboard-topbar__messenger"
                title="Мессенджер"
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
                className="dashboard-topbar__circle-action dashboard-topbar__circle-action--primary"
                onClick={goCreateRoom}
                title="Новая комната"
                aria-label="Новая комната"
              >
                <FiRrIcon name="circle-phone" className="dashboard-topbar__new-room-fi" />
              </button>
              <button
                type="button"
                className="dashboard-topbar__circle-action"
                onClick={onSignOut}
                title="Выход"
                aria-label="Выход"
              >
                <LogOutIcon />
              </button>
            </>
          ) : null}
          {canAccessAdmin ? (
            <Link to="/admin" className="dashboard-topbar__admin" title="Админка" aria-label="Админка">
              <AdminPanelIcon />
            </Link>
          ) : null}
        </div>
      </header>

      <div
        className={`dashboard-shell${showIncomingPinsBanner ? ' dashboard-shell--with-banner' : ''}`}
      >
        {showIncomingPinsBanner ? (
          <div className="dashboard-incoming-fav-banner" role="status" aria-live="polite">
            <p className="dashboard-incoming-fav-banner__text">
              Вас добавили в контакты. Добавьте этого человека к себе — вы станете взаимными контактами.
            </p>
            <div className="dashboard-incoming-fav-banner__actions">
              <Link to="/dashboard/contacts" className="dashboard-incoming-fav-banner__link">
                К разделу «Контакты»
              </Link>
              <button
                type="button"
                className="dashboard-incoming-fav-banner__dismiss"
                onClick={dismissIncomingPinsBanner}
              >
                Скрыть
              </button>
            </div>
          </div>
        ) : null}
        <main className="dashboard-body">
          <div className="dashboard-content dashboard-content--cabinet">{children}</div>
        </main>
      </div>

    </div>
  )
}
