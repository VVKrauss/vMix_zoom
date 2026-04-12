import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { parseSrtListenPort } from '../utils/parseSrtListenPort'
import { buildSoloViewerAbsoluteUrl } from '../utils/soloViewerParams'

export type SrtCopyMenuExtraItem = {
  key: string
  label: string
  onSelect: () => void
  variant?: 'default' | 'warn' | 'danger'
}

type MenuOptions = {
  enableLongPress: boolean
  /** Для пункта соло-ссылки на эту плитку */
  roomId?: string
  tilePeerId?: string
  /** false — скрыть пункт копирования соло-URL (только стример / админы). По умолчанию true. */
  showSoloViewerCopy?: boolean
  /** ПКМ: выключить микрофон этому участнику (шлётся на сигналинг). */
  guestMute?: { show: boolean; onMute: () => void }
  /** ПКМ: выгнать участника (только хост). */
  guestKick?: { show: boolean; onKick: () => void; onBan?: () => void }
  /** Доп. пункты (личный чат, избранное и т.д.) — те же, что можно открыть с плитки. */
  extraMenuItems?: SrtCopyMenuExtraItem[]
}

const LONG_MS = 550
const MOVE_THRESH = 12

function clampMenuPos(x: number, y: number, menuW: number, menuH: number) {
  const pad = 8
  const maxX = window.innerWidth - menuW - pad
  const maxY = window.innerHeight - menuH - pad
  return {
    x: Math.min(Math.max(pad, x), Math.max(pad, maxX)),
    y: Math.min(Math.max(pad, y), Math.max(pad, maxY)),
  }
}

export function useSrtCopyMenu(
  connectUrl?: string,
  listenPort?: number,
  options: MenuOptions = { enableLongPress: true },
) {
  const {
    enableLongPress,
    roomId,
    tilePeerId,
    showSoloViewerCopy = true,
    guestMute,
    guestKick,
    extraMenuItems,
  } = options

  const port = useMemo(() => {
    if (listenPort != null && listenPort > 0) return listenPort
    if (connectUrl?.trim()) return parseSrtListenPort(connectUrl) ?? null
    return null
  }, [listenPort, connectUrl])

  const url = connectUrl?.trim() ?? ''
  const canCopyPort = port != null
  const canCopyUrl = url.length > 0
  const canCopySoloPage =
    showSoloViewerCopy && Boolean(roomId?.trim()) && Boolean(tilePeerId?.trim())
  const canGuestMute = Boolean(guestMute?.show)
  const canGuestKick = Boolean(guestKick?.show)
  const extraCount = extraMenuItems?.length ?? 0
  /** Иначе на плитке экрана без SRT и до прихода screenPeerId меню не открывалось вовсе. */
  const canOpen =
    canCopyPort ||
    canCopyUrl ||
    canCopySoloPage ||
    Boolean(roomId?.trim()) ||
    canGuestMute ||
    canGuestKick ||
    extraCount > 0

  const soloPageFullUrl = useMemo(() => {
    if (!canCopySoloPage) return ''
    return buildSoloViewerAbsoluteUrl(roomId!.trim(), tilePeerId!.trim())
  }, [canCopySoloPage, roomId, tilePeerId])

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const lpTimer = useRef(0)
  const lpStart = useRef<{ x: number; y: number } | null>(null)

  const openAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!canOpen) return
      setMenu({ x: clientX, y: clientY })
    },
    [canOpen],
  )

  const close = useCallback(() => setMenu(null), [])

  const clearLongPress = useCallback(() => {
    window.clearTimeout(lpTimer.current)
    lpTimer.current = 0
    lpStart.current = null
  }, [])

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!canOpen) return
      e.preventDefault()
      e.stopPropagation()
      openAt(e.clientX, e.clientY)
    },
    [canOpen, openAt],
  )

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enableLongPress || !canOpen || e.touches.length !== 1) return
      const t = e.touches[0]
      lpStart.current = { x: t.clientX, y: t.clientY }
      clearLongPress()
      lpTimer.current = window.setTimeout(() => {
        lpTimer.current = 0
        openAt(t.clientX, t.clientY)
      }, LONG_MS)
    },
    [enableLongPress, canOpen, openAt, clearLongPress],
  )

  const onTouchEnd = useCallback(() => clearLongPress(), [clearLongPress])

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!lpStart.current || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - lpStart.current.x
      const dy = t.clientY - lpStart.current.y
      if (dx * dx + dy * dy > MOVE_THRESH * MOVE_THRESH) clearLongPress()
    },
    [clearLongPress],
  )

  const copyPort = useCallback(() => {
    if (port == null) return
    void navigator.clipboard.writeText(String(port)).then(close, close)
  }, [port, close])

  const copyUrl = useCallback(() => {
    if (!url) return
    void navigator.clipboard.writeText(url).then(close, close)
  }, [url, close])

  const copySoloPageUrl = useCallback(() => {
    if (!soloPageFullUrl) return
    void navigator.clipboard.writeText(soloPageFullUrl).then(close, close)
  }, [soloPageFullUrl, close])

  useEffect(() => () => clearLongPress(), [clearLongPress])

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    const onDown = (e: MouseEvent | TouchEvent) => {
      const el = document.querySelector('.srt-copy-menu')
      if (el && e.target instanceof Node && el.contains(e.target)) return
      close()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [menu, close])

  const menuPortal =
    menu &&
    createPortal(
      <SrtCopyMenuPanel
        x={menu.x}
        y={menu.y}
        canCopyPort={canCopyPort}
        canCopyUrl={canCopyUrl}
        canCopySoloPage={canCopySoloPage}
        onCopyPort={copyPort}
        onCopyUrl={copyUrl}
        onCopySoloPageUrl={copySoloPageUrl}
        canGuestMute={canGuestMute}
        onGuestMute={
          guestMute?.show
            ? () => {
                guestMute.onMute()
                close()
              }
            : undefined
        }
        canGuestKick={canGuestKick}
        onGuestKick={
          guestKick?.show
            ? () => {
                guestKick.onKick()
                close()
              }
            : undefined
        }
        onGuestBan={
          guestKick?.show && guestKick.onBan
            ? () => {
                guestKick.onBan?.()
                close()
              }
            : undefined
        }
        extraMenuItems={extraMenuItems}
        onClose={close}
      />,
      document.body,
    )

  const surfaceProps = enableLongPress
    ? {
        onContextMenu,
        onTouchStart,
        onTouchEnd,
        onTouchMove,
      }
    : { onContextMenu }

  return { canOpen, surfaceProps, menuPortal, openAt }
}

function SrtCopyMenuPanel({
  x,
  y,
  canCopyPort,
  canCopyUrl,
  canCopySoloPage,
  onCopyPort,
  onCopyUrl,
  onCopySoloPageUrl,
  canGuestMute,
  onGuestMute,
  canGuestKick,
  onGuestKick,
  onGuestBan,
  extraMenuItems,
  onClose,
}: {
  x: number
  y: number
  canCopyPort: boolean
  canCopyUrl: boolean
  canCopySoloPage: boolean
  onCopyPort: () => void
  onCopyUrl: () => void
  onCopySoloPageUrl: () => void
  canGuestMute: boolean
  onGuestMute?: () => void
  canGuestKick: boolean
  onGuestKick?: () => void
  onGuestBan?: () => void
  extraMenuItems?: SrtCopyMenuExtraItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos(clampMenuPos(x, y, r.width, r.height))
  }, [x, y])

  return (
    <div
      ref={ref}
      className="srt-copy-menu"
      style={{ left: pos.x, top: pos.y }}
      role="menu"
    >
      {canCopyPort && (
        <button type="button" className="srt-copy-menu__btn" role="menuitem" onClick={onCopyPort}>
          Копировать порт
        </button>
      )}
      {canCopyUrl && (
        <button type="button" className="srt-copy-menu__btn" role="menuitem" onClick={onCopyUrl}>
          Копировать SRT-ссылку
        </button>
      )}
      {canCopySoloPage && (
        <button
          type="button"
          className="srt-copy-menu__btn"
          role="menuitem"
          onClick={onCopySoloPageUrl}
          title="Ссылка на отдельное окно просмотра этого участника"
        >
          Копировать ссылку на окно
        </button>
      )}
      {canGuestMute && onGuestMute ? (
        <button type="button" className="srt-copy-menu__btn" role="menuitem" onClick={onGuestMute}>
          Выключить звук гостю
        </button>
      ) : null}
      {canGuestKick && onGuestKick ? (
        <button type="button" className="srt-copy-menu__btn srt-copy-menu__btn--warn" role="menuitem" onClick={onGuestKick}>
          Выгнать из комнаты
        </button>
      ) : null}
      {canGuestKick && onGuestBan ? (
        <button type="button" className="srt-copy-menu__btn srt-copy-menu__btn--danger" role="menuitem" onClick={onGuestBan}>
          Выгнать и заблокировать
        </button>
      ) : null}
      {extraMenuItems?.map((it) => {
        const cls =
          it.variant === 'danger'
            ? 'srt-copy-menu__btn srt-copy-menu__btn--danger'
            : it.variant === 'warn'
              ? 'srt-copy-menu__btn srt-copy-menu__btn--warn'
              : 'srt-copy-menu__btn'
        return (
          <button
            key={it.key}
            type="button"
            className={cls}
            role="menuitem"
            onClick={() => {
              it.onSelect()
              onClose()
            }}
          >
            {it.label}
          </button>
        )
      })}
      <button type="button" className="srt-copy-menu__btn srt-copy-menu__btn--muted" onClick={onClose}>
        Отмена
      </button>
    </div>
  )
}

/** Обёртка над областью видео (или полосой имени в PiP). */
export function SrtCopySurface({
  connectUrl,
  listenPort,
  roomId,
  tilePeerId,
  enableLongPress = true,
  showSoloViewerCopy = true,
  guestMute,
  guestKick,
  extraMenuItems,
  showTileOverflowButton = false,
  className = '',
  children,
}: {
  connectUrl?: string
  listenPort?: number
  roomId?: string
  /** peerId участника этой плитки (для соло-ссылки) */
  tilePeerId?: string
  enableLongPress?: boolean
  showSoloViewerCopy?: boolean
  guestMute?: { show: boolean; onMute: () => void }
  guestKick?: { show: boolean; onKick: () => void; onBan?: () => void }
  extraMenuItems?: SrtCopyMenuExtraItem[]
  /** Кнопка «⋯» справа снизу — то же меню, что по ПКМ / long-press. */
  showTileOverflowButton?: boolean
  className?: string
  children: ReactNode
}) {
  const { canOpen, surfaceProps, menuPortal, openAt } = useSrtCopyMenu(connectUrl, listenPort, {
    enableLongPress,
    roomId,
    tilePeerId,
    showSoloViewerCopy,
    guestMute,
    guestKick,
    extraMenuItems,
  })

  if (!canOpen) return <>{children}</>

  const onOverflowClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    openAt(r.right, r.bottom)
  }

  return (
    <>
      <div className={`srt-copy-target ${className}`.trim()} {...surfaceProps}>
        {children}
        {showTileOverflowButton ? (
          <button
            type="button"
            className="participant-tile-overflow-btn"
            aria-haspopup="menu"
            aria-label="Меню плитки"
            title="Меню"
            onClick={onOverflowClick}
          >
            ⋯
          </button>
        ) : null}
      </div>
      {menuPortal}
    </>
  )
}
