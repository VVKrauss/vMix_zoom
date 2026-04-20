import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiRrIcon } from './icons'
import { BrandLogoLoader } from './BrandLogoLoader'
import { RoomChatPanel } from './RoomChatPanel'
import type { ContactStatus } from '../lib/socialGraph'
import type { RoomChatMessage } from '../types/roomComms'
import { ShareSourcePopover } from './ShareSourcePopover'

type Props = {
  open: boolean
  onClose: () => void
  /** Есть ли картинка демонстрации (локально или с хоста «дивана»). */
  couchDemoLive: boolean
  /** Поток для большого превью: свой screen share или удалённый с хоста. */
  stageScreenStream: MediaStream | null
  /** Отдельный поток звука демонстрации (variant A). */
  stageScreenAudioStream: MediaStream | null
  /** Громкость воспроизведения демонстрации (0…1), не влияет на исходящий микс хоста. */
  stagePlayoutVolume: number
  onStagePlayoutVolumeChange: (v: number) => void
  /** Локальный превью без звука (без эха). */
  stageVideoMuted: boolean
  /** Можно открыть диалог выбора источника (только организатор «дивана»). */
  canPickCouchSource: boolean
  /** Показать «Остановить показ» (только если это наш исходящий шаринг). */
  canStopCouchShare: boolean
  /** Скрыть «Закрыть» (гость без прав завершить сессию для всех). */
  hideCouchClose?: boolean
  localStream: MediaStream | null
  pipPeers?: Array<{ id: string; stream: MediaStream; isLocal?: boolean }>
  onPickSource: (surface: 'monitor' | 'window' | 'browser') => void
  onStopShare: () => void
  /** На демонстрации есть живая аудиодорожка (в т.ч. удалённая). */
  couchDemoAudioActive: boolean
  isMuted: boolean
  isCamOff: boolean
  onToggleMute: () => void
  onToggleCam: () => void
  chat: {
    messages: RoomChatMessage[]
    localPeerId: string
    localUserId: string | null
    avatarByPeerId: Record<string, string | null | undefined>
    avatarByUserId: Record<string, string | null | undefined>
    contactStatuses: Record<string, ContactStatus>
    onToggleContactPin: (targetUserId: string, nextFavorite: boolean) => void
    onSend: (text: string) => void
    composerLocked: boolean
    composerLockedHint: string | null
  }
}

/**
 * Полноэкранный режим «Диван» (совместный просмотр). Контент дорабатывается отдельно.
 */
export function CouchModeWorkspace({
  open,
  onClose,
  couchDemoLive,
  stageScreenStream,
  stageScreenAudioStream,
  stagePlayoutVolume,
  onStagePlayoutVolumeChange,
  stageVideoMuted,
  canPickCouchSource,
  canStopCouchShare,
  hideCouchClose = false,
  localStream,
  pipPeers = [],
  onPickSource,
  onStopShare,
  couchDemoAudioActive,
  isMuted,
  isCamOff,
  onToggleMute,
  onToggleCam,
  chat,
}: Props) {
  if (!open) return null

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const pickerClose = useCallback(() => setSourcePickerOpen(false), [])
  const [chatPinned, setChatPinned] = useState(false)
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false)
  const chatOverlayCloseTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const chatOverlayHoverRef = useRef(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dockVisible, setDockVisible] = useState(true)
  const dockHideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const dockBlockAutoHideRef = useRef(false)

  const [toasts, setToasts] = useState<Array<{ id: string; author: string; text: string }>>([])
  const toastTimersRef = useRef<Map<string, ReturnType<typeof window.setTimeout>>>(new Map())
  const lastToastTsRef = useRef<number>(0)

  const [compactComposerOpen, setCompactComposerOpen] = useState(false)
  const [compactDraft, setCompactDraft] = useState('')
  const compactHideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const compactBlockAutoHideRef = useRef(false)
  const compactInputFocusedRef = useRef(false)

  const pick = useCallback(
    (surface: 'monitor' | 'window' | 'browser') => {
      setSourcePickerOpen(false)
      onPickSource(surface)
    },
    [onPickSource],
  )

  const showToast = useCallback((author: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const next = {
      id,
      author: author.trim() || 'Участник',
      text: trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed,
    }
    setToasts((prev) => {
      const merged = [...prev, next]
      return merged.length > 3 ? merged.slice(merged.length - 3) : merged
    })
    const t = window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id))
      const timers = toastTimersRef.current
      const handle = timers.get(id)
      if (handle) timers.delete(id)
    }, 5000)
    toastTimersRef.current.set(id, t)
  }, [])

  useEffect(() => {
    return () => {
      toastTimersRef.current.forEach((t) => window.clearTimeout(t))
      toastTimersRef.current.clear()
      if (dockHideTimerRef.current) window.clearTimeout(dockHideTimerRef.current)
      if (compactHideTimerRef.current) window.clearTimeout(compactHideTimerRef.current)
      if (chatOverlayCloseTimerRef.current) window.clearTimeout(chatOverlayCloseTimerRef.current)
    }
  }, [])

  // Fullscreen state sync
  useEffect(() => {
    const onFs = () => {
      const el = stageRef.current
      const fsEl = document.fullscreenElement
      const active = Boolean(el && fsEl && (fsEl === el || el.contains(fsEl)))
      setIsFullscreen(active)
      if (!active) {
        setDockVisible(true)
        setCompactComposerOpen(false)
      } else {
        // В fullscreen чат — только тосты + компактная панель.
        setChatPinned(false)
        setChatOverlayOpen(false)
        dockBlockAutoHideRef.current = false
        setDockVisible(true)
      }
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current
    if (!el) return
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {})
      return
    }
    await el.requestFullscreen().catch(() => {})
  }, [])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(el as any).srcObject = stageScreenStream ?? null
    el.muted = stageVideoMuted || !stageScreenStream
    el.volume = stageVideoMuted ? 0 : Math.max(0, Math.min(1, stagePlayoutVolume))
    if (stageScreenStream) {
      void el.play().catch(() => {})
    }
  }, [stageScreenStream, stagePlayoutVolume, stageVideoMuted])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(el as any).srcObject = stageScreenAudioStream ?? null
    el.volume = Math.max(0, Math.min(1, stagePlayoutVolume))
    if (!stageScreenAudioStream) return
    // Как в SoloViewer: сначала пробуем с muted=true для автоплея, затем снимаем mute.
    el.muted = true
    void el.play().catch(() => {})
    el.muted = false
    void el.play().catch(() => {})
  }, [stageScreenAudioStream, stagePlayoutVolume])

  const pipRow = pipPeers.length > 1

  function CouchCamPip({ id, stream, isLocal = false }: { id: string; stream: MediaStream; isLocal?: boolean }) {
    const ref = useRef<HTMLVideoElement | null>(null)
    useEffect(() => {
      const el = ref.current
      if (!el) return
      const track = stream.getVideoTracks()[0] ?? null
      if (!track) return
      const s = new MediaStream([track])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(el as any).srcObject = s
      const play = () => void el.play().catch(() => {})
      el.onloadedmetadata = play
      play()
      return () => {
        if (el.onloadedmetadata === play) el.onloadedmetadata = null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(el as any).srcObject = null
      }
    }, [stream])
    return (
      <div
        className={`couch-mode-workspace__cam-pip${pipRow ? ' couch-mode-workspace__cam-pip--small' : ''}${isLocal ? ' couch-mode-workspace__cam-pip--local' : ''}`}
        data-peer={id}
      >
        <video ref={ref} className="couch-mode-workspace__cam-pip-video" muted playsInline autoPlay />
      </div>
    )
  }

  // Show toast for new messages when chat isn't pinned+visible (esp fullscreen).
  useEffect(() => {
    if (!isFullscreen && chatPinned) return
    const last = chat.messages[chat.messages.length - 1]
    if (!last) return
    if (last.ts <= lastToastTsRef.current) return
    lastToastTsRef.current = last.ts
    showToast(last.name, last.text)
  }, [chat.messages, chatPinned, isFullscreen, showToast])

  const armDockAutoHide = useCallback(() => {
    if (!isFullscreen) return
    if (sourcePickerOpen) return
    if (dockBlockAutoHideRef.current) return
    if (dockHideTimerRef.current) window.clearTimeout(dockHideTimerRef.current)
    dockHideTimerRef.current = window.setTimeout(() => {
      dockBlockAutoHideRef.current = false
      setDockVisible(false)
      if (!compactBlockAutoHideRef.current && !compactInputFocusedRef.current) {
        setCompactComposerOpen(false)
      }
      dockHideTimerRef.current = null
    }, 2200)
  }, [isFullscreen, sourcePickerOpen])

  const setDockBlockAutoHide = useCallback((block: boolean) => {
    dockBlockAutoHideRef.current = block
    if (block) {
      if (dockHideTimerRef.current) {
        window.clearTimeout(dockHideTimerRef.current)
        dockHideTimerRef.current = null
      }
      setDockVisible(true)
    } else {
      armDockAutoHide()
    }
  }, [armDockAutoHide])

  const onStagePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Fullscreen: auto-hide dock + hover-zone composer
    if (isFullscreen) {
      if (!dockVisible) setDockVisible(true)
      armDockAutoHide()

      // Compact composer trigger zone: bottom-right 100x50px when chat isn't pinned
      if (chatPinned) return
      const el = stageRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      const inZone = x >= r.width - 100 && y >= r.height - 50
      if (inZone) {
        setCompactComposerOpen(true)
        if (compactHideTimerRef.current) {
          window.clearTimeout(compactHideTimerRef.current)
          compactHideTimerRef.current = null
        }
      } else if (
        !dockBlockAutoHideRef.current &&
        !compactBlockAutoHideRef.current &&
        !compactInputFocusedRef.current &&
        compactComposerOpen
      ) {
        // Ушли из зоны — скрываем через короткую паузу.
        if (compactHideTimerRef.current) window.clearTimeout(compactHideTimerRef.current)
        compactHideTimerRef.current = window.setTimeout(() => {
          setCompactComposerOpen(false)
          compactHideTimerRef.current = null
        }, 800)
      }
      return
    }

    // Not fullscreen: unpinned chat slides in on right-edge hover.
    if (chatPinned) return
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left
    const nearRightEdge = x >= r.width - 28
    if (nearRightEdge) {
      setChatOverlayOpen(true)
      if (chatOverlayCloseTimerRef.current) {
        window.clearTimeout(chatOverlayCloseTimerRef.current)
        chatOverlayCloseTimerRef.current = null
      }
      return
    }
    if (!chatOverlayHoverRef.current && chatOverlayOpen) {
      if (chatOverlayCloseTimerRef.current) window.clearTimeout(chatOverlayCloseTimerRef.current)
      chatOverlayCloseTimerRef.current = window.setTimeout(() => {
        setChatOverlayOpen(false)
        chatOverlayCloseTimerRef.current = null
      }, 220)
    }
  }, [armDockAutoHide, chatOverlayOpen, chatPinned, compactComposerOpen, dockVisible, isFullscreen])

  const hideCompactComposerSoon = useCallback(() => {
    if (compactHideTimerRef.current) window.clearTimeout(compactHideTimerRef.current)
    compactHideTimerRef.current = window.setTimeout(() => {
      setCompactComposerOpen(false)
      compactHideTimerRef.current = null
    }, 3000)
  }, [])

  const sendCompact = useCallback(() => {
    if (chat.composerLocked) return
    const trimmed = compactDraft.trim()
    if (!trimmed) return
    chat.onSend(trimmed)
    setCompactDraft('')
    showToast('Вы', trimmed)
    hideCompactComposerSoon()
  }, [chat, compactDraft, hideCompactComposerSoon, showToast])

  const chatSidebarShown = !isFullscreen && chatPinned
  const showDock = !isFullscreen || dockVisible

  const couchRootClass = useMemo(
    () =>
      `couch-mode-workspace${isFullscreen ? ' couch-mode-workspace--fullscreen' : ''}${
        chatSidebarShown ? ' couch-mode-workspace--chat-pinned' : ' couch-mode-workspace--chat-hidden'
      }`,
    [chatSidebarShown, isFullscreen],
  )

  return (
    <div
      className={couchRootClass}
      role="dialog"
      aria-modal="true"
      aria-labelledby="couch-mode-workspace-title"
    >
      <header className="couch-mode-workspace__header">
        <h1 id="couch-mode-workspace-title" className="couch-mode-workspace__title">
          <FiRrIcon name="sofa" className="couch-mode-workspace__title-fi" aria-hidden />
          Диван
        </h1>
        <div className="couch-mode-workspace__header-actions" role="group" aria-label="Панель">
          {!isFullscreen && couchDemoLive ? (
            <span className="couch-mode-workspace__header-status" role="status">
              {couchDemoAudioActive ? 'Идёт показ · звук включён' : 'Идёт показ · звук может быть недоступен'}
            </span>
          ) : null}
          {!isFullscreen && canStopCouchShare ? (
            <button
              type="button"
              className="couch-mode-workspace__header-btn couch-mode-workspace__header-btn--danger"
              onClick={onStopShare}
              title="Остановить показ"
              aria-label="Остановить показ"
            >
              <FiRrIcon name="stop-circle" aria-hidden />
            </button>
          ) : null}
          {!isFullscreen ? (
            <>
              <button
                type="button"
                className={`couch-mode-workspace__header-btn couch-mode-workspace__header-btn--cam${isCamOff ? ' couch-mode-workspace__header-btn--off' : ''}`}
                onClick={onToggleCam}
                title={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
                aria-label={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
              >
                <FiRrIcon name={isCamOff ? 'video-slash' : 'video-camera'} aria-hidden />
              </button>
              <button
                type="button"
                className={`couch-mode-workspace__header-btn couch-mode-workspace__header-btn--mic${isMuted ? ' couch-mode-workspace__header-btn--off' : ''}`}
                onClick={onToggleMute}
                title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
              >
                <FiRrIcon name={isMuted ? 'microphone-slash' : 'microphone'} aria-hidden />
              </button>
            </>
          ) : null}
          {couchDemoLive ? (
            <div
              className="couch-mode-workspace__header-volume"
              role="group"
              aria-label="Громкость звука входящей демонстрации (расшаренное окно или вкладка)"
            >
              <span className="couch-mode-workspace__header-volume-label" title="Входящий звук расшаренного источника">
                Звук экрана
              </span>
              <input
                type="range"
                className="couch-mode-workspace__header-volume-slider"
                min={0}
                max={100}
                value={Math.round(stagePlayoutVolume * 100)}
                onChange={(e) =>
                  onStagePlayoutVolumeChange(Math.max(0, Math.min(1, Number(e.target.value) / 100)))
                }
                title="Громкость воспроизведения расшаренного окна, вкладки или экрана"
                aria-label="Громкость звука расшаренного экрана"
              />
            </div>
          ) : null}
          <button
            type="button"
            className={`couch-mode-workspace__header-btn${isFullscreen ? '' : ' couch-mode-workspace__header-btn--off'}`}
            onClick={() => void toggleFullscreen()}
            title={isFullscreen ? 'Выйти из полноэкранного' : 'Полноэкранный режим'}
          >
            <FiRrIcon name={isFullscreen ? 'compress' : 'expand'} aria-hidden />
          </button>
        </div>
        {!hideCouchClose ? (
          <button type="button" className="couch-mode-workspace__close" onClick={onClose}>
            Закрыть
          </button>
        ) : null}
      </header>
      <div className="couch-mode-workspace__body couch-mode-workspace__body--split">
        <section className="couch-mode-workspace__stage" aria-label="Совместный просмотр">
          <div
            className="couch-mode-workspace__stage-inner"
            ref={stageRef}
            onPointerMove={onStagePointerMove}
            onPointerDown={() => {
              if (!isFullscreen) return
              setDockVisible(true)
              armDockAutoHide()
            }}
            onPointerLeave={() => {
              if (!isFullscreen) return
              if (dockBlockAutoHideRef.current) return
              armDockAutoHide()
            }}
          >
            <div className="couch-mode-workspace__capture">
              {stageScreenStream ? (
                <video
                  ref={videoRef}
                  className="couch-mode-workspace__capture-video"
                  muted={stageVideoMuted}
                  playsInline
                  autoPlay
                />
              ) : canPickCouchSource ? (
                <div className="couch-mode-workspace__capture-empty" role="status">
                  <p className="couch-mode-workspace__hint">
                    Выберите источник (вкладка / окно / экран) — начнётся демонстрация со звуком, если поддерживается.
                  </p>
                </div>
              ) : (
                <div className="couch-mode-workspace__capture-waiting" role="status">
                  <BrandLogoLoader size={72} />
                  <p className="couch-mode-workspace__capture-waiting-text">Ожидаем запуска</p>
                </div>
              )}
            </div>
            {stageScreenAudioStream ? (
              <audio ref={audioRef} autoPlay playsInline />
            ) : null}

            {/* Hotspot для выезда чата справа (когда не закреплён). */}
            {!isFullscreen && !chatPinned ? (
              <div
                className="couch-mode-workspace__chat-hotspot"
                aria-hidden
                onPointerEnter={() => setChatOverlayOpen(true)}
              />
            ) : null}

            {!isCamOff && pipPeers.length > 0 ? (
              <div
                className={`couch-mode-workspace__cam-pips${pipRow ? ' couch-mode-workspace__cam-pips--row' : ''}`}
                aria-label="Камеры участников"
              >
                {pipPeers.map((p) => (
                  <CouchCamPip key={p.id} id={p.id} stream={p.stream} isLocal={p.isLocal} />
                ))}
              </div>
            ) : null}

            {/* В fullscreen док управления не показываем вообще. В non-fullscreen док нужен только до старта показа. */}
            {!isFullscreen && !couchDemoLive && canPickCouchSource ? (
              <div
                className={`couch-mode-workspace__controls${showDock ? '' : ' couch-mode-workspace__controls--hidden'}`}
                role="group"
                aria-label="Управление просмотром"
                onPointerEnter={() => setDockBlockAutoHide(true)}
                onPointerLeave={() => setDockBlockAutoHide(false)}
              >
                <button
                  type="button"
                  className="couch-mode-workspace__pick-source"
                  onClick={() => setSourcePickerOpen(true)}
                >
                  Выберите источник
                </button>
                {sourcePickerOpen ? (
                  <div onPointerEnter={() => setDockBlockAutoHide(true)} onPointerLeave={() => setDockBlockAutoHide(false)}>
                    <ShareSourcePopover
                      isSharing={false}
                      onClose={pickerClose}
                      onPick={(surface) => pick(surface)}
                      onStop={() => {}}
                    />
                  </div>
                ) : null}
                </div>
            ) : null}

            {isFullscreen && !chatPinned && compactComposerOpen ? (
              <div
                className="couch-mode-workspace__compact-composer"
                onPointerMove={(e) => e.stopPropagation()}
                onPointerEnter={() => {
                  compactBlockAutoHideRef.current = true
                  if (compactHideTimerRef.current) {
                    window.clearTimeout(compactHideTimerRef.current)
                    compactHideTimerRef.current = null
                  }
                }}
                onPointerLeave={() => {
                  compactBlockAutoHideRef.current = false
                  if (!compactInputFocusedRef.current) {
                    if (compactHideTimerRef.current) window.clearTimeout(compactHideTimerRef.current)
                    compactHideTimerRef.current = window.setTimeout(() => {
                      setCompactComposerOpen(false)
                      compactHideTimerRef.current = null
                    }, 900)
                  }
                }}
              >
                {canStopCouchShare ? (
                  <button
                    type="button"
                    className="couch-mode-workspace__ctrl-mini couch-mode-workspace__ctrl-mini--danger"
                    onClick={onStopShare}
                    title="Остановить показ"
                    aria-label="Остановить показ"
                  >
                    <FiRrIcon name="stop-circle" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`couch-mode-workspace__ctrl-mini${isCamOff ? ' couch-mode-workspace__ctrl-mini--off' : ''}`}
                  onClick={onToggleCam}
                  title={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
                >
                  <FiRrIcon name={isCamOff ? 'video-slash' : 'video-camera'} aria-hidden />
                </button>
                <button
                  type="button"
                  className={`couch-mode-workspace__ctrl-mini${isMuted ? ' couch-mode-workspace__ctrl-mini--off' : ''}`}
                  onClick={onToggleMute}
                  title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                >
                  <FiRrIcon name={isMuted ? 'microphone-slash' : 'microphone'} aria-hidden />
                </button>
                <textarea
                  className="couch-mode-workspace__compact-input"
                  rows={1}
                  placeholder={chat.composerLocked ? 'Отправка недоступна' : 'Сообщение…'}
                  value={compactDraft}
                  disabled={chat.composerLocked}
                  onChange={(e) => setCompactDraft(e.target.value)}
                  onFocus={() => {
                    compactInputFocusedRef.current = true
                    compactBlockAutoHideRef.current = true
                    if (compactHideTimerRef.current) {
                      window.clearTimeout(compactHideTimerRef.current)
                      compactHideTimerRef.current = null
                    }
                  }}
                  onBlur={() => {
                    compactInputFocusedRef.current = false
                    compactBlockAutoHideRef.current = false
                    if (compactHideTimerRef.current) window.clearTimeout(compactHideTimerRef.current)
                    compactHideTimerRef.current = window.setTimeout(() => {
                      setCompactComposerOpen(false)
                      compactHideTimerRef.current = null
                    }, 1200)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendCompact()
                    }
                  }}
                />
                <button
                  type="button"
                  className="couch-mode-workspace__compact-send"
                  onClick={sendCompact}
                  disabled={chat.composerLocked || compactDraft.trim().length === 0}
                >
                  Отправить
                </button>
              </div>
            ) : null}

            {(isFullscreen || !chatPinned) && toasts.length > 0 ? (
              <div
                className={`couch-mode-workspace__toast-stack${isFullscreen && compactComposerOpen ? ' couch-mode-workspace__toast-stack--above-composer' : ''}`}
                aria-live="polite"
              >
                {toasts.map((t) => (
                  <div key={t.id} className="couch-mode-workspace__toast" role="status">
                    <strong className="couch-mode-workspace__toast-author">{t.author}:</strong>{' '}
                    <span className="couch-mode-workspace__toast-text">{t.text}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* Unpinned chat: slide-in overlay on right-edge hover (not in fullscreen). */}
        {!isFullscreen && !chatPinned ? (
          <aside
            className={`couch-mode-workspace__chat-overlay${chatOverlayOpen ? ' couch-mode-workspace__chat-overlay--open' : ''}`}
            aria-label="Чат комнаты (оверлей)"
            onPointerEnter={() => {
              chatOverlayHoverRef.current = true
              setChatOverlayOpen(true)
              if (chatOverlayCloseTimerRef.current) {
                window.clearTimeout(chatOverlayCloseTimerRef.current)
                chatOverlayCloseTimerRef.current = null
              }
            }}
            onPointerLeave={() => {
              chatOverlayHoverRef.current = false
              if (chatOverlayCloseTimerRef.current) window.clearTimeout(chatOverlayCloseTimerRef.current)
              chatOverlayCloseTimerRef.current = window.setTimeout(() => {
                setChatOverlayOpen(false)
                chatOverlayCloseTimerRef.current = null
              }, 260)
            }}
          >
            <RoomChatPanel
              variant="embed"
              open
              onClose={() => setChatOverlayOpen(false)}
              headerRight={
                <button
                  type="button"
                  className="couch-mode-workspace__chat-pin-btn"
                  title="Закрепить чат"
                  onClick={() => setChatPinned(true)}
                >
                  <FiRrIcon name="thumbtack" aria-hidden />
                </button>
              }
              messages={chat.messages}
              localPeerId={chat.localPeerId}
              localUserId={chat.localUserId}
              avatarByPeerId={chat.avatarByPeerId}
              avatarByUserId={chat.avatarByUserId}
              contactStatuses={chat.contactStatuses}
              onToggleContactPin={chat.onToggleContactPin}
              onSend={chat.onSend}
              composerLocked={chat.composerLocked}
              composerLockedHint={chat.composerLockedHint}
            />
          </aside>
        ) : null}

        {chatSidebarShown ? (
          <aside className="couch-mode-workspace__chat" aria-label="Чат комнаты">
            <RoomChatPanel
              variant="embed"
              open
              onClose={() => setChatPinned(false)}
              headerRight={
                <button
                  type="button"
                  className="couch-mode-workspace__chat-pin-btn"
                  title="Открепить чат"
                  onClick={() => setChatPinned(false)}
                >
                  <FiRrIcon name="thumbtack" aria-hidden />
                </button>
              }
              messages={chat.messages}
              localPeerId={chat.localPeerId}
              localUserId={chat.localUserId}
              avatarByPeerId={chat.avatarByPeerId}
              avatarByUserId={chat.avatarByUserId}
              contactStatuses={chat.contactStatuses}
              onToggleContactPin={chat.onToggleContactPin}
              onSend={chat.onSend}
              composerLocked={chat.composerLocked}
              composerLockedHint={chat.composerLockedHint}
            />
          </aside>
        ) : null}
      </div>
    </div>
  )
}
