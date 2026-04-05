import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { parseSrtListenPort } from '../utils/parseSrtListenPort'
import { buildSoloViewerAbsoluteUrl } from '../utils/soloViewerParams'

type MenuOptions = {
  enableLongPress: boolean
  /** Для пункта «полная ссылка ?room=&peer=» на эту плитку */
  roomId?: string
  tilePeerId?: string
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
  const { enableLongPress, roomId, tilePeerId } = options

  const port = useMemo(() => {
    if (listenPort != null && listenPort > 0) return listenPort
    if (connectUrl?.trim()) return parseSrtListenPort(connectUrl) ?? null
    return null
  }, [listenPort, connectUrl])

  const url = connectUrl?.trim() ?? ''
  const canCopyPort = port != null
  const canCopyUrl = url.length > 0
  const canCopySoloPage =
    Boolean(roomId?.trim()) && Boolean(tilePeerId?.trim())
  const canOpen = canCopyPort || canCopyUrl || canCopySoloPage

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

  return { canOpen, surfaceProps, menuPortal }
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
          title="Полный URL с параметрами room и peer (соло-страница участника)"
        >
          Копировать полный URL (?room=…&amp;peer=…)
        </button>
      )}
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
  className = '',
  children,
}: {
  connectUrl?: string
  listenPort?: number
  roomId?: string
  /** peerId участника этой плитки (для соло-ссылки) */
  tilePeerId?: string
  enableLongPress?: boolean
  className?: string
  children: ReactNode
}) {
  const { canOpen, surfaceProps, menuPortal } = useSrtCopyMenu(connectUrl, listenPort, {
    enableLongPress,
    roomId,
    tilePeerId,
  })

  if (!canOpen) return <>{children}</>

  return (
    <>
      <div className={`srt-copy-target ${className}`.trim()} {...surfaceProps}>
        {children}
      </div>
      {menuPortal}
    </>
  )
}
