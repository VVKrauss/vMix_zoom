import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import { DevicePopover } from './DevicePopover'
import { ScreenSharePickerModal } from './ScreenSharePickerModal'
import type { VideoPreset } from '../types'
import { VIDEO_PRESETS } from '../types'
import type { LayoutMode, ObjectFit } from './RoomPage'
import { ReactionEmojiPopover } from './ReactionEmojiPopover'
import { useMediaQuery } from '../hooks/useMediaQuery'

const LAYOUT_CYCLE: LayoutMode[] = ['grid', 'speaker', 'pip']

function nextLayoutMode(current: LayoutMode): LayoutMode {
  const i = LAYOUT_CYCLE.indexOf(current)
  const idx = i < 0 ? 0 : (i + 1) % LAYOUT_CYCLE.length
  return LAYOUT_CYCLE[idx]!
}

function layoutModeLabel(mode: LayoutMode): string {
  switch (mode) {
    case 'grid':
      return 'Галерея'
    case 'speaker':
      return 'Спикер'
    default:
      return 'Превью поверх'
  }
}

interface Props {
  isMuted: boolean
  isCamOff: boolean
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCameraId: string
  selectedMicId: string
  onToggleMute: () => void
  onToggleCam: () => void
  onLeaveRequest: () => void
  onSwitchCamera: (deviceId: string) => void
  onSwitchMic: (deviceId: string) => void
  activePreset: VideoPreset
  onChangePreset: (p: VideoPreset) => void
  objectFit: ObjectFit
  onObjectFitToggle: () => void
  layout: LayoutMode
  onLayoutChange: (l: LayoutMode) => void
  showMeter: boolean
  onToggleMeter: () => void
  showInfo: boolean
  onToggleInfo: () => void
  onResetView: () => void
  isScreenSharing: boolean
  onToggleScreenShare: () => void
  onStartScreenShare: (surface?: 'monitor' | 'window' | 'browser') => void
  playoutVolume: number
  onPlayoutVolumeChange: (v: number) => void
  audioOutputs: MediaDeviceInfo[]
  playoutSinkId: string
  onPlayoutSinkChange: (deviceId: string) => void
  showButtonLabels: boolean
  onToggleButtonLabels: () => void
  chatOpen: boolean
  onToggleChat: () => void
  chatUnreadCount: number
  chatEmbed: boolean
  onToggleChatEmbed: () => void
  onSendReaction: (emoji: string) => void
}

type OpenPopover = 'mic' | 'cam' | 'headphones' | 'chat' | 'reaction' | 'layout' | 'screen' | 'settings' | null

export function ControlsBar({
  isMuted, isCamOff,
  cameras, microphones, selectedCameraId, selectedMicId,
  onToggleMute, onToggleCam, onLeaveRequest,
  onSwitchCamera, onSwitchMic,
  activePreset, onChangePreset,
  objectFit, onObjectFitToggle, layout, onLayoutChange,
  showMeter, onToggleMeter,
  showInfo, onToggleInfo,
  onResetView,
  isScreenSharing, onToggleScreenShare, onStartScreenShare,
  playoutVolume, onPlayoutVolumeChange,
  audioOutputs, playoutSinkId, onPlayoutSinkChange,
  showButtonLabels, onToggleButtonLabels,
  chatOpen, onToggleChat,
  chatUnreadCount,
  chatEmbed, onToggleChatEmbed,
  onSendReaction,
}: Props) {
  const isNarrow = useMediaQuery('(max-width: 768px)')
  const [open, setOpen] = useState<OpenPopover>(null)
  const [screenPickerOpen, setScreenPickerOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const playoutSavedRef = useRef(1)

  useEffect(() => {
    if (playoutVolume >= 0.02) playoutSavedRef.current = playoutVolume
  }, [playoutVolume])

  const toggleOpen = (which: OpenPopover) =>
    setOpen(prev => prev === which ? null : which)

  const togglePlayoutMute = useCallback(() => {
    setOpen((o) => (o === 'headphones' ? null : o))
    if (playoutVolume < 0.02) {
      onPlayoutVolumeChange(Math.min(1, Math.max(0.02, playoutSavedRef.current)))
    } else {
      playoutSavedRef.current = playoutVolume
      onPlayoutVolumeChange(0)
    }
  }, [playoutVolume, onPlayoutVolumeChange])

  useEffect(() => {
    if (!isNarrow) setMobileMoreOpen(false)
  }, [isNarrow])

  useEffect(() => {
    if (!mobileMoreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(null)
        setMobileMoreOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileMoreOpen])

  const closeMobileMore = () => {
    setOpen(null)
    setMobileMoreOpen(false)
  }

  return (
    <div className={`controls-bar${showButtonLabels ? '' : ' controls-bar--icons-only'}${isNarrow ? ' controls-bar--narrow' : ''}`}>
      <div className="controls-bar__main">
      {/* ── Camera ─────────────────────────────────────────────────────── */}
      <div className="ctrl-group">
        <button
          className={`ctrl-btn ${isCamOff ? 'ctrl-btn--off' : ''}`}
          onClick={onToggleCam}
          title={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
        >
          {isCamOff ? <CamOffIcon /> : <CamIcon />}
          <span>{isCamOff ? 'Включить' : 'Камера'}</span>
        </button>
        <button
          className={`ctrl-chevron ${isCamOff ? 'ctrl-btn--off' : ''} ${open === 'cam' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('cam')}
          title="Выбрать камеру"
        >
          <ChevronIcon />
        </button>

        {open === 'cam' && (
          <DevicePopover
            label="Камера"
            devices={cameras}
            selectedId={selectedCameraId}
            onSelect={id => { onSwitchCamera(id) }}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      {/* ── Microphone ─────────────────────────────────────────────────── */}
      <div className="ctrl-group">
        <button
          className={`ctrl-btn ${isMuted ? 'ctrl-btn--off' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
          <span>{isMuted ? 'Включить' : 'Микрофон'}</span>
        </button>
        <button
          className={`ctrl-chevron ${isMuted ? 'ctrl-btn--off' : ''} ${open === 'mic' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('mic')}
          title="Выбрать микрофон"
        >
          <ChevronIcon />
        </button>

        {open === 'mic' && (
          <DevicePopover
            label="Микрофон"
            devices={microphones}
            selectedId={selectedMicId}
            onSelect={id => { onSwitchMic(id) }}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      {!isNarrow && (
        <>
      {/* ── Headphones (громкость + выход) ─────────────────────────────── */}
      <div className="ctrl-group">
        <button
          type="button"
          className={`ctrl-btn ${playoutVolume < 0.02 ? 'ctrl-btn--off' : ''}`}
          onClick={togglePlayoutMute}
          title={playoutVolume < 0.02 ? 'Включить звук других участников' : 'Отключить звук других участников'}
        >
          {playoutVolume < 0.02 ? <HeadphonesMutedIcon /> : <HeadphonesIcon />}
          <span>{playoutVolume < 0.02 ? 'Включить' : 'Наушники'}</span>
        </button>
        <button
          type="button"
          className={`ctrl-chevron ${playoutVolume < 0.02 ? 'ctrl-btn--off' : ''} ${open === 'headphones' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('headphones')}
          title="Громкость и устройство вывода"
        >
          <ChevronIcon />
        </button>

        {open === 'headphones' && (
          <PlayoutPopover
            onClose={() => setOpen(null)}
            playoutVolume={playoutVolume}
            onPlayoutVolumeChange={onPlayoutVolumeChange}
            audioOutputs={audioOutputs}
            playoutSinkId={playoutSinkId}
            onPlayoutSinkChange={onPlayoutSinkChange}
          />
        )}
      </div>
        </>
      )}

      {/* ── Чат ────────────────────────────────────────────────────────── */}
      <div className="ctrl-group ctrl-group--chat">
        <button
          type="button"
          className={`ctrl-btn ctrl-btn--chat${chatOpen ? ' ctrl-btn--chat-open' : ''}`}
          onClick={() => {
            setOpen(null)
            onToggleChat()
          }}
          title={chatOpen ? 'Закрыть чат' : 'Открыть чат'}
          aria-label={
            !chatOpen && chatUnreadCount > 0
              ? `Чат, непрочитано: ${chatUnreadCount > 99 ? 'более 99' : chatUnreadCount}`
              : undefined
          }
        >
          <ChatBubbleIcon />
          <span>Чат</span>
          {!chatOpen && chatUnreadCount > 0 ? (
            <span className="chat-unread-badge" aria-hidden>
              {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`ctrl-chevron ${open === 'chat' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('chat')}
          title="Режим чата"
        >
          <ChevronIcon />
        </button>

        {open === 'chat' && (
          <ChatOptionsPopover
            chatEmbed={chatEmbed}
            onToggleChatEmbed={onToggleChatEmbed}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      {!isNarrow && (
        <>
      {/* ── Layout (цикл по кнопке; меню — шеврон) ───────────────────── */}
      <div className="ctrl-group">
        <button
          type="button"
          className="ctrl-btn"
          onClick={() => onLayoutChange(nextLayoutMode(layout))}
          title={`Сейчас: ${layoutModeLabel(layout)}. Следующий вид: ${layoutModeLabel(nextLayoutMode(layout))}`}
        >
          {layout === 'grid' ? <GridIcon /> : layout === 'speaker' ? <SpeakerIcon /> : <PipIcon />}
          <span>{layoutModeLabel(layout)}</span>
        </button>
        <button
          type="button"
          className={`ctrl-chevron ${open === 'layout' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('layout')}
          title="Выбрать раскладку"
        >
          <ChevronIcon />
        </button>

        {open === 'layout' && (
          <LayoutPopover
            layout={layout}
            onClose={() => setOpen(null)}
            onPick={(l) => {
              onLayoutChange(l)
              setOpen(null)
            }}
          />
        )}
      </div>

      {/* ── Screen share (кастомный выбор → системный диалог; плитка в комнате) ─ */}
      <div className="ctrl-group">
        <button
          type="button"
          className={`ctrl-btn ${isScreenSharing ? 'ctrl-btn--active ctrl-btn--screen' : ''}`}
          onClick={() => {
            if (isScreenSharing) onToggleScreenShare()
            else setScreenPickerOpen(true)
          }}
          title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
        >
          <ScreenShareIcon />
          <span>{isScreenSharing ? 'Стоп экран' : 'Экран'}</span>
        </button>
        <button
          type="button"
          className={`ctrl-chevron ${isScreenSharing ? 'ctrl-btn--active ctrl-btn--screen' : ''} ${open === 'screen' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('screen')}
          title={isScreenSharing ? 'Меню демонстрации' : 'Тип источника демонстрации'}
        >
          <ChevronIcon />
        </button>

        {open === 'screen' && (
          <ShareSourcePopover
            isSharing={isScreenSharing}
            onClose={() => setOpen(null)}
            onPick={(surface) => {
              void onStartScreenShare(surface)
              setOpen(null)
            }}
            onStop={() => {
              onToggleScreenShare()
              setOpen(null)
            }}
          />
        )}
      </div>

      {/* ── Settings ───────────────────────────────────────────────────── */}
      <div className="ctrl-group ctrl-group--solo">
        <button
          className={`ctrl-btn ${open === 'settings' ? 'ctrl-btn--active' : ''}`}
          onClick={() => toggleOpen('settings')}
          title="Настройки"
        >
          <GearIcon />
          <span>Настройки</span>
        </button>

        {open === 'settings' && (
          <SettingsPopover
            activePreset={activePreset}
            onChangePreset={onChangePreset}
            objectFit={objectFit}
            onObjectFitToggle={onObjectFitToggle}
            layout={layout}
            showMeter={showMeter}
            onToggleMeter={onToggleMeter}
            showInfo={showInfo}
            onToggleInfo={onToggleInfo}
            showButtonLabels={showButtonLabels}
            onToggleButtonLabels={onToggleButtonLabels}
            onResetView={() => { onResetView(); setOpen(null) }}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
        </>
      )}

      <button type="button" className="ctrl-btn ctrl-btn--leave" onClick={onLeaveRequest}>
        <LeaveIcon />
        <span>Выйти</span>
      </button>

      {isNarrow && (
        <button
          type="button"
          className="ctrl-btn ctrl-btn--mobile-more"
          onClick={() => { setOpen(null); setMobileMoreOpen(true) }}
          title="Ещё действия"
          aria-label="Ещё действия"
          aria-expanded={mobileMoreOpen}
        >
          <MoreVerticalIcon />
          <span>Ещё</span>
        </button>
      )}
      </div>

      {screenPickerOpen && (
        <ScreenSharePickerModal
          onClose={() => setScreenPickerOpen(false)}
          onPickSurface={(surface) => {
            setScreenPickerOpen(false)
            void onStartScreenShare(surface)
          }}
        />
      )}

      {!isNarrow && (
      <div className="controls-bar__reaction-floater">
        <div className="ctrl-group ctrl-group--solo">
          <button
            type="button"
            className={`ctrl-btn ${open === 'reaction' ? 'ctrl-btn--active' : ''}`}
            onClick={() => toggleOpen('reaction')}
            title="Отправить реакцию"
          >
            <ReactionEmojiIcon />
            <span>Реакция</span>
          </button>
          {open === 'reaction' && (
            <ReactionEmojiPopover
              onClose={() => setOpen(null)}
              onPick={(emoji) => {
                onSendReaction(emoji)
                setOpen(null)
              }}
            />
          )}
        </div>
      </div>
      )}

      {isNarrow && mobileMoreOpen && (
        <>
          <div
            className="mobile-controls-sheet-backdrop"
            role="presentation"
            onClick={closeMobileMore}
          />
          <div
            className="mobile-controls-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Дополнительные действия"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-controls-sheet__title">Ещё</div>
            <div className="mobile-controls-sheet__groups">
              <div className="ctrl-group ctrl-group--sheet">
                <button
                  type="button"
                  className={`ctrl-btn ${playoutVolume < 0.02 ? 'ctrl-btn--off' : ''}`}
                  onClick={togglePlayoutMute}
                  title={playoutVolume < 0.02 ? 'Включить звук других участников' : 'Отключить звук других участников'}
                >
                  {playoutVolume < 0.02 ? <HeadphonesMutedIcon /> : <HeadphonesIcon />}
                  <span>{playoutVolume < 0.02 ? 'Включить' : 'Наушники'}</span>
                </button>
                <button
                  type="button"
                  className={`ctrl-chevron ${playoutVolume < 0.02 ? 'ctrl-btn--off' : ''} ${open === 'headphones' ? 'ctrl-chevron--open' : ''}`}
                  onClick={() => toggleOpen('headphones')}
                  title="Громкость и устройство вывода"
                >
                  <ChevronIcon />
                </button>
                {open === 'headphones' && (
                  <PlayoutPopover
                    onClose={() => setOpen(null)}
                    playoutVolume={playoutVolume}
                    onPlayoutVolumeChange={onPlayoutVolumeChange}
                    audioOutputs={audioOutputs}
                    playoutSinkId={playoutSinkId}
                    onPlayoutSinkChange={onPlayoutSinkChange}
                  />
                )}
              </div>

              <div className="ctrl-group ctrl-group--sheet">
                <button
                  type="button"
                  className="ctrl-btn"
                  onClick={() => onLayoutChange(nextLayoutMode(layout))}
                  title={`Сейчас: ${layoutModeLabel(layout)}. Следующий вид: ${layoutModeLabel(nextLayoutMode(layout))}`}
                >
                  {layout === 'grid' ? <GridIcon /> : layout === 'speaker' ? <SpeakerIcon /> : <PipIcon />}
                  <span>{layoutModeLabel(layout)}</span>
                </button>
                <button
                  type="button"
                  className={`ctrl-chevron ${open === 'layout' ? 'ctrl-chevron--open' : ''}`}
                  onClick={() => toggleOpen('layout')}
                  title="Выбрать раскладку"
                >
                  <ChevronIcon />
                </button>
                {open === 'layout' && (
                  <LayoutPopover
                    layout={layout}
                    onClose={() => setOpen(null)}
                    onPick={(l) => {
                      onLayoutChange(l)
                      setOpen(null)
                    }}
                  />
                )}
              </div>

              <div className="ctrl-group ctrl-group--sheet">
                <button
                  type="button"
                  className={`ctrl-btn ${isScreenSharing ? 'ctrl-btn--active ctrl-btn--screen' : ''}`}
                  onClick={() => {
                    if (isScreenSharing) onToggleScreenShare()
                    else setScreenPickerOpen(true)
                  }}
                  title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
                >
                  <ScreenShareIcon />
                  <span>{isScreenSharing ? 'Стоп экран' : 'Экран'}</span>
                </button>
                <button
                  type="button"
                  className={`ctrl-chevron ${isScreenSharing ? 'ctrl-btn--active ctrl-btn--screen' : ''} ${open === 'screen' ? 'ctrl-chevron--open' : ''}`}
                  onClick={() => toggleOpen('screen')}
                  title={isScreenSharing ? 'Меню демонстрации' : 'Тип источника демонстрации'}
                >
                  <ChevronIcon />
                </button>
                {open === 'screen' && (
                  <ShareSourcePopover
                    isSharing={isScreenSharing}
                    onClose={() => setOpen(null)}
                    onPick={(surface) => {
                      void onStartScreenShare(surface)
                      setOpen(null)
                    }}
                    onStop={() => {
                      onToggleScreenShare()
                      setOpen(null)
                    }}
                  />
                )}
              </div>

              <div className="ctrl-group ctrl-group--solo ctrl-group--sheet">
                <button
                  type="button"
                  className={`ctrl-btn ${open === 'settings' ? 'ctrl-btn--active' : ''}`}
                  onClick={() => toggleOpen('settings')}
                  title="Настройки"
                >
                  <GearIcon />
                  <span>Настройки</span>
                </button>
                {open === 'settings' && (
                  <SettingsPopover
                    activePreset={activePreset}
                    onChangePreset={onChangePreset}
                    objectFit={objectFit}
                    onObjectFitToggle={onObjectFitToggle}
                    layout={layout}
                    showMeter={showMeter}
                    onToggleMeter={onToggleMeter}
                    showInfo={showInfo}
                    onToggleInfo={onToggleInfo}
                    showButtonLabels={showButtonLabels}
                    onToggleButtonLabels={onToggleButtonLabels}
                    onResetView={() => { onResetView(); setOpen(null) }}
                    onClose={() => setOpen(null)}
                  />
                )}
              </div>

              <div className="ctrl-group ctrl-group--solo ctrl-group--sheet">
                <button
                  type="button"
                  className={`ctrl-btn ${open === 'reaction' ? 'ctrl-btn--active' : ''}`}
                  onClick={() => toggleOpen('reaction')}
                  title="Отправить реакцию"
                >
                  <ReactionEmojiIcon />
                  <span>Реакция</span>
                </button>
                {open === 'reaction' && (
                  <ReactionEmojiPopover
                    onClose={() => setOpen(null)}
                    onPick={(emoji) => {
                      onSendReaction(emoji)
                      setOpen(null)
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MoreVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="18" r="1.75" />
    </svg>
  )
}

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 7.5 7.5 0 0114-3 7.5 7.5 0 013 6z" />
    </svg>
  )
}

function ReactionEmojiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </svg>
  )
}

function LayoutPopover({
  layout,
  onClose,
  onPick,
}: {
  layout: LayoutMode
  onClose: () => void
  onPick: (l: LayoutMode) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const rows: { mode: LayoutMode; label: string; icon: ReactNode }[] = [
    { mode: 'grid', label: 'Галерея', icon: <GridIcon /> },
    { mode: 'speaker', label: 'Спикер', icon: <SpeakerIcon /> },
    { mode: 'pip', label: 'Превью поверх', icon: <PipIcon /> },
  ]

  return (
    <div className="device-popover device-popover--layout-pick" ref={ref}>
      <div className="device-popover__title">Раскладка</div>
      {rows.map(({ mode, label, icon }) => (
        <button
          key={mode}
          type="button"
          className={`device-popover__item${layout === mode ? ' device-popover__item--active' : ''}`}
          onClick={() => onPick(mode)}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  )
}

function ScreenPickIconMonitor() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="6" y="8" width="36" height="26" rx="3" />
      <path d="M16 38h16M24 34v4" strokeLinecap="round" />
    </svg>
  )
}

function ScreenPickIconWindow() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="8" y="12" width="32" height="28" rx="2" />
      <path d="M8 18h32" />
      <circle cx="14" cy="15" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ScreenPickIconTab() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M6 14h36v22a3 3 0 01-3 3H9a3 3 0 01-3-3V14z" />
      <path d="M6 14V11a3 3 0 013-3h30a3 3 0 013 3v3" />
      <path d="M18 22h16M18 28h10" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}

function ShareSourcePopover({
  isSharing,
  onClose,
  onPick,
  onStop,
}: {
  isSharing: boolean
  onClose: () => void
  onPick: (surface: 'monitor' | 'window' | 'browser') => void
  onStop: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="device-popover device-popover--share-source" ref={ref}>
      <div className="device-popover__title">{isSharing ? 'Демонстрация' : 'Что показать'}</div>
      {isSharing ? (
        <button type="button" className="device-popover__item" onClick={onStop}>
          Остановить демонстрацию
        </button>
      ) : (
        <>
          <button type="button" className="device-popover__item" onClick={() => onPick('monitor')}>
            <span className="screen-share-source-popover__icon" aria-hidden><ScreenPickIconMonitor /></span>
            Весь экран
          </button>
          <button type="button" className="device-popover__item" onClick={() => onPick('window')}>
            <span className="screen-share-source-popover__icon" aria-hidden><ScreenPickIconWindow /></span>
            Окно приложения
          </button>
          <button type="button" className="device-popover__item" onClick={() => onPick('browser')}>
            <span className="screen-share-source-popover__icon" aria-hidden><ScreenPickIconTab /></span>
            Вкладка браузера
          </button>
        </>
      )}
    </div>
  )
}

// ─── Settings popover ────────────────────────────────────────────────────────

function PlayoutPopover({
  onClose,
  playoutVolume,
  onPlayoutVolumeChange,
  audioOutputs,
  playoutSinkId,
  onPlayoutSinkChange,
}: {
  onClose: () => void
  playoutVolume: number
  onPlayoutVolumeChange: (v: number) => void
  audioOutputs: MediaDeviceInfo[]
  playoutSinkId: string
  onPlayoutSinkChange: (deviceId: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="device-popover device-popover--playout" ref={ref}>
      <div className="device-popover__title">Наушники</div>
      <div className="device-popover__section">
        <span className="device-popover__label">Громкость других</span>
        <input
          type="range"
          className="device-popover__volume"
          min={0}
          max={100}
          value={Math.round(playoutVolume * 100)}
          onChange={(e) => onPlayoutVolumeChange(Number(e.target.value) / 100)}
        />
      </div>
      {audioOutputs.length > 0 && (
        <div className="device-popover__section">
          <span className="device-popover__label">Выход звука</span>
          <select
            className="settings-select device-popover__select-full"
            value={playoutSinkId || audioOutputs[0]?.deviceId || ''}
            onChange={(e) => onPlayoutSinkChange(e.target.value)}
          >
            {audioOutputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

function ChatOptionsPopover({
  chatEmbed,
  onToggleChatEmbed,
  onClose,
}: {
  chatEmbed: boolean
  onToggleChatEmbed: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover__title">Чат</div>
      <button type="button" className="settings-row settings-row--btn" onClick={onToggleChatEmbed}>
        <span className="settings-label">Чат в интерфейсе</span>
        <span className={`settings-toggle ${chatEmbed ? 'settings-toggle--on' : ''}`}>
          {chatEmbed ? 'Вкл' : 'Выкл'}
        </span>
      </button>
    </div>
  )
}

function SettingsPopover({
  activePreset, onChangePreset,
  objectFit, onObjectFitToggle, layout,
  showMeter, onToggleMeter,
  showInfo, onToggleInfo,
  showButtonLabels, onToggleButtonLabels,
  onResetView, onClose,
}: {
  activePreset: VideoPreset
  onChangePreset: (p: VideoPreset) => void
  objectFit: ObjectFit
  onObjectFitToggle: () => void
  layout: LayoutMode
  showMeter: boolean
  onToggleMeter: () => void
  showInfo: boolean
  onToggleInfo: () => void
  showButtonLabels: boolean
  onToggleButtonLabels: () => void
  onResetView: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover__title">Настройки</div>

      {/* Quality */}
      <div className="settings-row">
        <span className="settings-label">Качество видео</span>
        <select
          className="settings-select"
          value={VIDEO_PRESETS.indexOf(activePreset)}
          onChange={(e) => onChangePreset(VIDEO_PRESETS[Number(e.target.value)])}
        >
          {VIDEO_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Object-fit (галерея и спикер) */}
      {(layout === 'grid' || layout === 'speaker') && (
        <button className="settings-row settings-row--btn" onClick={onObjectFitToggle}>
          <span className="settings-label">Масштаб видео</span>
          <span className="settings-value">{objectFit === 'contain' ? 'Полный' : 'Заполнить'}</span>
        </button>
      )}

      {/* Audio meter toggle */}
      <button className="settings-row settings-row--btn" onClick={onToggleMeter}>
        <span className="settings-label">Аудиометр</span>
        <span className={`settings-toggle ${showMeter ? 'settings-toggle--on' : ''}`}>
          {showMeter ? 'Вкл' : 'Выкл'}
        </span>
      </button>

      {/* Info toggle */}
      <button className="settings-row settings-row--btn" onClick={onToggleInfo}>
        <span className="settings-label">Инфо</span>
        <span className={`settings-toggle ${showInfo ? 'settings-toggle--on' : ''}`}>
          {showInfo ? 'Вкл' : 'Выкл'}
        </span>
      </button>

      <button type="button" className="settings-row settings-row--btn" onClick={onToggleButtonLabels}>
        <span className="settings-label">Подписи кнопок</span>
        <span className={`settings-toggle ${showButtonLabels ? 'settings-toggle--on' : ''}`}>
          {showButtonLabels ? 'Вкл' : 'Выкл'}
        </span>
      </button>

      {/* Reset */}
      <button className="settings-row settings-row--btn settings-row--reset" onClick={onResetView}>
        <span className="settings-label">Сбросить вид</span>
      </button>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}
function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}
function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h3a2 2 0 012 2v9.34" />
      <path d="M16 11.37A4 4 0 1112.63 8L16 11.37z" />
    </svg>
  )
}
function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}

function ScreenShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}
function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ transform: 'rotate(180deg)' }}>
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

function HeadphonesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 18v-6a9 9 0 0118 0v6" />
      <path d="M21 19a2 2 0 01-2 2h-1v-8h1a2 2 0 012 2v4z" />
      <path d="M3 19a2 2 0 002 2h1v-8H5a2 2 0 00-2 2v4z" />
    </svg>
  )
}

function HeadphonesMutedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 18v-6a9 9 0 0118 0v6" />
      <path d="M21 19a2 2 0 01-2 2h-1v-8h1a2 2 0 012 2v4z" />
      <path d="M3 19a2 2 0 002 2h1v-8H5a2 2 0 00-2 2v4z" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.68 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="2" width="10" height="12" rx="1" />
      <rect x="12" y="4" width="3" height="8" rx="0.5" opacity="0.85" />
    </svg>
  )
}

function PipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="14" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="8" width="6" height="6" rx="1" />
    </svg>
  )
}
