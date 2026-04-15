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
  DashboardIcon,
  FiRrIcon,
  HomeIcon,
  LogOutIcon,
  MenuBurgerIcon,
  ParticipantsBadgeIcon,
  RoomsIcon,
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
  /** Единая шапка с бургером (как в моб. быстром меню), кроме раздела «Комнаты». */
  const unifiedCabinetNav = Boolean(!chromeless && active !== 'chats')
  /** Бургер в шапке: всегда для unified; для «Комнаты» только на узкой ширине. */
  const showCabinetBurger = Boolean(!chromeless && !suppressBurger && (unifiedCabinetNav || isMobileCabinetNav))
  /** Круглые кнопки мессенджер / новая комната / выход — только у «Комнаты» на десктопе. */
  const showCabinetQuickCircleActions = Boolean(!chromeless && active === 'chats' && !isMobileCabinetNav)
  const [cabinetMenuOpen, setCabinetMenuOpen] = useState(false)
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

  const closeCabinetMenu = useCallback(() => setCabinetMenuOpen(false), [])

  useEffect(() => {
    closeCabinetMenu()
  }, [location.pathname, closeCabinetMenu])

  useEffect(() => {
    if (!cabinetMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCabinetMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cabinetMenuOpen, closeCabinetMenu])

  const goCreateRoomFromMenu = () => {
    closeCabinetMenu()
    goCreateRoom()
  }

  return (
    <div
      className={`dashboard-page${chromeless ? ' dashboard-page--messenger-chromeless' : ''}${
        showCabinetBurger ? ' dashboard-page--cabinet-mobile-burger' : ''
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
          {showCabinetBurger ? (
            <button
              type="button"
              className={`dashboard-messenger__list-head-btn dashboard-topbar__cabinet-burger${cabinetMenuOpen ? ' dashboard-messenger__list-head-btn--open' : ''}`}
              onClick={() => setCabinetMenuOpen((v) => !v)}
              aria-label={cabinetMenuOpen ? 'Закрыть меню' : 'Меню'}
              aria-expanded={cabinetMenuOpen}
              aria-haspopup="true"
            >
              <MenuBurgerIcon />
            </button>
          ) : null}
        </div>
      </header>

      <div
        className={`dashboard-shell${showIncomingPinsBanner ? ' dashboard-shell--with-banner' : ''}`}
      >
        {showIncomingPinsBanner ? (
          <div className="dashboard-incoming-fav-banner" role="status" aria-live="polite">
            <p className="dashboard-incoming-fav-banner__text">
              Вас закрепили у себя. Закрепите этого человека у себя — вы станете взаимными контактами.
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

      {showCabinetBurger ? (
        <>
          <div
            className={`dashboard-messenger-quick-menu-backdrop${
              cabinetMenuOpen ? ' dashboard-messenger-quick-menu-backdrop--open' : ''
            }`}
            aria-hidden={!cabinetMenuOpen}
            onClick={closeCabinetMenu}
            role="presentation"
          />
          <nav
            className={`dashboard-messenger-quick-menu${
              cabinetMenuOpen ? ' dashboard-messenger-quick-menu--open' : ''
            } dashboard-messenger-quick-menu--anchor-head`}
            aria-hidden={!cabinetMenuOpen}
            aria-label="Навигация по кабинету"
          >
            <div className="dashboard-messenger-quick-menu__grid" role="toolbar">
              <Link to="/" className="dashboard-messenger-quick-menu__btn" onClick={closeCabinetMenu}>
                <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                  <HomeIcon />
                </span>
                <span className="dashboard-messenger-quick-menu__lbl">Главная</span>
              </Link>
              {active !== 'cabinet' ? (
                <Link
                  to="/dashboard"
                  className="dashboard-messenger-quick-menu__btn"
                  onClick={closeCabinetMenu}
                >
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <DashboardIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Кабинет</span>
                </Link>
              ) : null}
              {active !== 'chats' ? (
                <Link
                  to="/dashboard/chats"
                  className="dashboard-messenger-quick-menu__btn"
                  onClick={closeCabinetMenu}
                >
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <RoomsIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Комнаты</span>
                </Link>
              ) : null}
              {active !== 'messenger' ? (
                <Link
                  to="/dashboard/messenger"
                  className="dashboard-messenger-quick-menu__btn"
                  onClick={closeCabinetMenu}
                >
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <ChatBubbleIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Мессенджер</span>
                  {unreadCount > 0 ? (
                    <span className="dashboard-messenger-quick-menu__badge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </Link>
              ) : null}
              {active !== 'contacts' ? (
                <Link
                  to="/dashboard/contacts"
                  className="dashboard-messenger-quick-menu__btn"
                  onClick={closeCabinetMenu}
                >
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <ParticipantsBadgeIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Контакты</span>
                </Link>
              ) : null}
              {!unifiedCabinetNav ? (
                <button type="button" className="dashboard-messenger-quick-menu__btn" onClick={goCreateRoomFromMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <FiRrIcon name="circle-phone" />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Новая комната</span>
                </button>
              ) : null}
              {canAccessAdmin ? (
                <Link to="/admin" className="dashboard-messenger-quick-menu__btn" onClick={closeCabinetMenu}>
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
                  closeCabinetMenu()
                  onSignOut()
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
      ) : null}

    </div>
  )
}
