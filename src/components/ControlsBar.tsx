import { useEffect, useRef, useState, useCallback } from 'react'
import { DevicePopover } from './DevicePopover'
import { PillToggle } from './PillToggle'
import { ScreenSharePickerModal } from './ScreenSharePickerModal'
import type { VideoPreset } from '../types'
import { presetToSimpleTier, simpleTierToPreset } from '../utils/simpleVideoQuality'
import type { LayoutMode, VmixIngressPhase } from './RoomPage'
import { ReactionEmojiPopover } from './ReactionEmojiPopover'
import { MicIcon, MicOffIcon, CamIcon, CamOffIcon } from './icons'
import { useOnOutsideClick } from '../hooks/useOnOutsideClick'

const LAYOUT_CYCLE: LayoutMode[] = ['grid', 'meet', 'speaker', 'pip', 'facetile']

function nextLayoutMode(current: LayoutMode): LayoutMode {
  const i = LAYOUT_CYCLE.indexOf(current)
  const idx = i < 0 ? 0 : (i + 1) % LAYOUT_CYCLE.length
  return LAYOUT_CYCLE[idx]!
}

function layoutModeLabel(mode: LayoutMode): string {
  switch (mode) {
    case 'grid':
      return 'Плитки'
    case 'meet':
      return 'Лента'
    case 'speaker':
      return 'Спикер'
    case 'pip':
      return 'Картинка в картинке'
    case 'facetile':
      return 'Мобильное'
    default:
      return 'Картинка в картинке'
  }
}

/** Одна иконка для смены раскладки: 2×2, верхний левый — только рамка, остальные залиты. */
function LayoutModePickerIcon() {
  return (
    <svg className="layout-mode-picker-icon" width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="0.5" y="0.5" width="6" height="6" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="9" y="0" width="7" height="7" rx="0.75" />
      <rect x="0" y="9" width="7" height="7" rx="0.75" />
      <rect x="9" y="9" width="7" height="7" rx="0.75" />
    </svg>
  )
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
  layout: LayoutMode
  onLayoutChange: (l: LayoutMode) => void
  showMeter: boolean
  onToggleMeter: () => void
  showInfo: boolean
  onToggleInfo: () => void
  onResetView: () => void
  isScreenSharing: boolean
  canStartScreenShare: boolean
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
  chatToastNotifications: boolean
  onToggleChatToastNotifications: () => void
  onSendReaction: (emoji: string) => void
  /** Неоновое оформление панели (режим «стример»). */
  streamerMode?: boolean
  onStreamerModeChange?: (value: boolean) => void
  vmixPhase: VmixIngressPhase
  vmixIngressLoading: boolean
  onStartVmixIngress: () => void
  /** Открыть подтверждение остановки (основная кнопка при активном ingress). */
  onRequestStopVmixIngress: () => void
  /** Показать параметры подключения без перезапуска (шеврон). */
  onOpenVmixSettings: () => void
  /** Окно «Настройки сервера» из шестерёнки. */
  onOpenServerSettings: () => void
  /** Горизонтальное зеркало только локального превью камеры (не влияет на исходящий поток). */
  mirrorLocalCamera: boolean
  onToggleMirrorLocalCamera: () => void
  /** Громкость потока программы vMix (0…1), localStorage у каждого участника. */
  vmixProgramVolume: number
  onVmixProgramVolumeChange: (v: number) => void
  vmixProgramMuted: boolean
  onToggleVmixProgramMuted: () => void
  /** Мобильный viewport: панель скрыта, меню только из FAB справа снизу. */
  forceMobileFabMenu: boolean
  viewportMobile: boolean
  immersiveAutoHide: boolean
  onToggleImmersiveAutoHide: () => void
  /** Автоскрытие шапки/панели — закрыть мобильное меню (бургер / «Ещё»). */
  chromeHidden: boolean
}

type OpenPopover = 'mic' | 'cam' | 'headphones' | 'chat' | 'reaction' | 'layout' | 'screen' | 'settings' | null

export function ControlsBar({
  isMuted, isCamOff,
  cameras, microphones, selectedCameraId, selectedMicId,
  onToggleMute, onToggleCam, onLeaveRequest,
  onSwitchCamera, onSwitchMic,
  activePreset, onChangePreset,
  layout, onLayoutChange,
  showMeter, onToggleMeter,
  showInfo, onToggleInfo,
  onResetView,
  isScreenSharing, canStartScreenShare, onToggleScreenShare, onStartScreenShare,
  playoutVolume, onPlayoutVolumeChange,
  audioOutputs, playoutSinkId, onPlayoutSinkChange,
  showButtonLabels, onToggleButtonLabels,
  chatOpen, onToggleChat,
  chatUnreadCount,
  chatEmbed, onToggleChatEmbed,
  chatToastNotifications, onToggleChatToastNotifications,
  onSendReaction,
  streamerMode = false,
  onStreamerModeChange,
  vmixPhase,
  vmixIngressLoading,
  onStartVmixIngress,
  onRequestStopVmixIngress,
  onOpenVmixSettings,
  onOpenServerSettings,
  mirrorLocalCamera,
  onToggleMirrorLocalCamera,
  vmixProgramVolume,
  onVmixProgramVolumeChange,
  vmixProgramMuted,
  onToggleVmixProgramMuted,
  forceMobileFabMenu,
  viewportMobile,
  immersiveAutoHide,
  onToggleImmersiveAutoHide,
  chromeHidden,
}: Props) {
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
    if (!forceMobileFabMenu) setMobileMoreOpen(false)
  }, [forceMobileFabMenu])

  useEffect(() => {
    if (!chromeHidden) return
    setOpen(null)
    setMobileMoreOpen(false)
  }, [chromeHidden])

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

  const toggleMobileSheet = () => {
    setOpen(null)
    setMobileMoreOpen((v) => !v)
  }

  const showMainBar = !forceMobileFabMenu
  const sheetMenuOpen = mobileMoreOpen && forceMobileFabMenu

  const sh = (base: string, sheet?: boolean) => sheet ? `${base} ctrl-group--sheet` : base

  const headphonesGroup = (sheet?: boolean) => (
    <div className={sh('ctrl-group', sheet)}>
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
  )

  const chatGroup = (sheet?: boolean) => (
    <div className={sh('ctrl-group ctrl-group--chat', sheet)}>
      <button
        type="button"
        className={`ctrl-btn ctrl-btn--chat${chatOpen ? ' ctrl-btn--chat-open' : ''}`}
        onClick={() => { setOpen(null); onToggleChat() }}
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
          chatToastNotifications={chatToastNotifications}
          onToggleChatToastNotifications={onToggleChatToastNotifications}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )

  const layoutGroup = (sheet?: boolean) => (
    <div className={sh('ctrl-group', sheet)}>
      <button
        type="button"
        className="ctrl-btn"
        onClick={() => onLayoutChange(nextLayoutMode(layout))}
        title={`Сейчас: ${layoutModeLabel(layout)}. Следующий вид: ${layoutModeLabel(nextLayoutMode(layout))}`}
      >
        <LayoutModePickerIcon />
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
          onPick={(l) => { onLayoutChange(l); setOpen(null) }}
        />
      )}
    </div>
  )

  const screenShareGroup = (sheet?: boolean) => (
    <div className={sh('ctrl-group', sheet)}>
      <button
        type="button"
        className={`ctrl-btn ${isScreenSharing ? 'ctrl-btn--active ctrl-btn--screen' : ''}`}
        disabled={!isScreenSharing && !canStartScreenShare}
        onClick={() => {
          if (isScreenSharing) onToggleScreenShare()
          else if (canStartScreenShare) setScreenPickerOpen(true)
        }}
        title={
          isScreenSharing
            ? 'Остановить демонстрацию'
            : canStartScreenShare
              ? 'Демонстрация экрана'
              : 'В комнате уже идёт демонстрация экрана'
        }
      >
        <ScreenShareIcon />
        <span>{isScreenSharing ? 'Стоп экран' : 'Экран'}</span>
      </button>
      <button
        type="button"
        className={`ctrl-chevron ${isScreenSharing ? 'ctrl-btn--active ctrl-btn--screen' : ''} ${open === 'screen' ? 'ctrl-chevron--open' : ''}`}
        disabled={!isScreenSharing && !canStartScreenShare}
        onClick={() => { if (isScreenSharing || canStartScreenShare) toggleOpen('screen') }}
        title={isScreenSharing ? 'Меню демонстрации' : 'Тип источника демонстрации'}
      >
        <ChevronIcon />
      </button>
      {open === 'screen' && (
        <ShareSourcePopover
          isSharing={isScreenSharing}
          onClose={() => setOpen(null)}
          onPick={(surface) => { if (canStartScreenShare) void onStartScreenShare(surface); setOpen(null) }}
          onStop={() => { onToggleScreenShare(); setOpen(null) }}
        />
      )}
    </div>
  )

  const settingsGroup = (sheet?: boolean) => (
    <div className={sh('ctrl-group ctrl-group--solo', sheet)}>
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
          showInfo={showInfo}
          onToggleInfo={onToggleInfo}
          showButtonLabels={showButtonLabels}
          onToggleButtonLabels={onToggleButtonLabels}
          onResetView={() => { onResetView(); setOpen(null) }}
          onOpenServerSettings={() => { onOpenServerSettings(); setOpen(null) }}
          onClose={() => setOpen(null)}
          viewportMobile={viewportMobile}
          immersiveAutoHide={immersiveAutoHide}
          onToggleImmersiveAutoHide={onToggleImmersiveAutoHide}
          streamerMode={streamerMode}
          onStreamerModeChange={onStreamerModeChange}
        />
      )}
    </div>
  )

  const vmixSourcesBlock = (sheet?: boolean) => {
    const shClass = sh('ctrl-group ctrl-group--vmix-source', sheet)
    if (vmixPhase === 'idle') {
      return (
        <button
          type="button"
          className={`ctrl-btn ctrl-btn--source-ingest ctrl-btn--source-ingest--vmix${vmixIngressLoading ? ' ctrl-btn--loading' : ''}`}
          title={vmixIngressLoading ? 'Подключение…' : 'Добавить источник vMix / SRT'}
          disabled={vmixIngressLoading}
          aria-busy={vmixIngressLoading}
          onClick={onStartVmixIngress}
        >
          <img
            className="ctrl-btn__source-logo-img"
            src="/srt-logo.png"
            alt=""
            width={48}
            height={18}
            draggable={false}
          />
        </button>
      )
    }
    const phaseClass =
      vmixPhase === 'live'
        ? 'ctrl-btn--source-ingest--vmix-live'
        : 'ctrl-btn--source-ingest--vmix-waiting'
    const chevronPhase =
      vmixPhase === 'live' ? 'ctrl-chevron--vmix-live' : 'ctrl-chevron--vmix-waiting'
    const mainTitle =
      vmixPhase === 'live'
        ? 'Поток vMix активен. Нажмите, чтобы остановить'
        : 'Ожидание подключения vMix. Нажмите, чтобы остановить'
    return (
      <div className={shClass}>
        <button
          type="button"
          className={`ctrl-btn ctrl-btn--source-ingest ctrl-btn--source-ingest--vmix ${phaseClass}${vmixIngressLoading ? ' ctrl-btn--loading' : ''}`}
          title={vmixIngressLoading ? 'Подключение…' : mainTitle}
          disabled={vmixIngressLoading}
          aria-busy={vmixIngressLoading}
          onClick={onRequestStopVmixIngress}
        >
          <img
            className="ctrl-btn__source-logo-img"
            src="/srt-logo.png"
            alt=""
            width={48}
            height={18}
            draggable={false}
          />
        </button>
        <div
          className={`ctrl-vmix-audio ctrl-vmix-audio--${vmixPhase === 'live' ? 'live' : 'waiting'}`}
          role="group"
          aria-label="Звук программы vMix"
        >
          <button
            type="button"
            className={`ctrl-vmix-audio__mute${vmixProgramMuted ? ' ctrl-vmix-audio__mute--off' : ''}`}
            title={vmixProgramMuted ? 'Включить звук программы vMix' : 'Отключить звук программы vMix'}
            aria-pressed={vmixProgramMuted}
            disabled={vmixIngressLoading}
            onClick={onToggleVmixProgramMuted}
          >
            {vmixProgramMuted ? <ProgramSpeakerMutedIcon /> : <ProgramSpeakerIcon />}
          </button>
          <input
            type="range"
            className="ctrl-vmix-audio__slider"
            min={0}
            max={100}
            value={Math.round(vmixProgramVolume * 100)}
            onChange={(e) => onVmixProgramVolumeChange(Number(e.target.value) / 100)}
            disabled={vmixIngressLoading}
            title="Громкость программы vMix"
            aria-label="Громкость программы vMix"
          />
        </div>
        <button
          type="button"
          className={`ctrl-chevron ${chevronPhase}`}
          disabled={vmixIngressLoading}
          onClick={() => onOpenVmixSettings()}
          title="Параметры подключения vMix"
        >
          <ChevronIcon />
        </button>
      </div>
    )
  }

  const reactionGroup = (sheet?: boolean) => (
    <div className={sh('ctrl-group ctrl-group--solo', sheet)}>
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
          onPick={(emoji) => { onSendReaction(emoji); setOpen(null) }}
        />
      )}
    </div>
  )

  const sourcesStrip = (sheet: boolean) =>
    streamerMode ? (
      <div className={`controls-bar__sources${sheet ? ' controls-bar__sources--in-sheet' : ''}`} aria-label="Внешние источники">
        <button
          type="button"
          className="ctrl-btn ctrl-btn--source-ingest ctrl-btn--source-ingest--ndi"
          title="Добавить источник NDI (скоро)"
          onClick={() => {}}
        >
          <img
            className="ctrl-btn__source-logo-img"
            src="/ndi-logo.png"
            alt=""
            width={56}
            height={18}
            draggable={false}
          />
        </button>
        {vmixSourcesBlock(sheet)}
      </div>
    ) : null

  return (
    <div
      className={`controls-bar${showButtonLabels ? '' : ' controls-bar--icons-only'}${streamerMode ? ' controls-bar--streamer-mode' : ''}${forceMobileFabMenu ? ' controls-bar--fab-dock' : ''}`}
    >
      {showMainBar ? (
      <div className="controls-bar__main">
      {sourcesStrip(false)}

      <div className="controls-bar__core">
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
            videoQualityTier={presetToSimpleTier(activePreset)}
            onVideoQualityTierChange={(tier) => { void onChangePreset(simpleTierToPreset(tier)) }}
            mirrorLocalPreview={mirrorLocalCamera}
            onToggleMirrorLocalPreview={onToggleMirrorLocalCamera}
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
            audioMeter={showMeter}
            onToggleAudioMeter={onToggleMeter}
          />
        )}
      </div>

      {headphonesGroup()}

      {chatGroup()}
      {layoutGroup()}
      {screenShareGroup()}
      {settingsGroup()}

      <button type="button" className="ctrl-btn ctrl-btn--leave" onClick={onLeaveRequest}>
        <LeaveIcon />
        <span>Выйти</span>
      </button>
      </div>
      </div>
      ) : null}

      {forceMobileFabMenu ? (
        <div
          className={`ctrl-mobile-fab-dock${sheetMenuOpen ? ' ctrl-mobile-fab-dock--sheet-open' : ''}`}
        >
          <button
            type="button"
            className="ctrl-mobile-fab ctrl-mobile-fab--menu"
            onClick={toggleMobileSheet}
            title="Меню управления"
            aria-label="Меню управления"
            aria-expanded={mobileMoreOpen}
          >
            <MenuHamburgerIcon />
          </button>
          <button
            type="button"
            className="ctrl-mobile-fab ctrl-mobile-fab--leave"
            onClick={onLeaveRequest}
            title="Выйти из комнаты"
            aria-label="Выйти из комнаты"
          >
            <LeaveIcon />
          </button>
          <button
            type="button"
            className={`ctrl-mobile-fab${isMuted ? ' ctrl-mobile-fab--off' : ''}`}
            onClick={onToggleMute}
            title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </button>
          <button
            type="button"
            className={`ctrl-mobile-fab${isCamOff ? ' ctrl-mobile-fab--off' : ''}`}
            onClick={onToggleCam}
            title={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
            aria-label={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
          >
            {isCamOff ? <CamOffIcon /> : <CamIcon />}
          </button>
        </div>
      ) : null}

      {screenPickerOpen && (
        <ScreenSharePickerModal
          onClose={() => setScreenPickerOpen(false)}
          onPickSurface={(surface) => {
            setScreenPickerOpen(false)
            void onStartScreenShare(surface)
          }}
        />
      )}

      {!forceMobileFabMenu && (
        <div className="controls-bar__reaction-floater">
          {reactionGroup()}
        </div>
      )}

      {sheetMenuOpen && (
        <>
          <div
            className="mobile-controls-sheet-backdrop"
            role="presentation"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              closeMobileMore()
            }}
            onClick={(e) => {
              e.preventDefault()
              closeMobileMore()
            }}
          />
          <div
            className="mobile-controls-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Меню управления"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-controls-sheet__title">Меню</div>
            <div className="mobile-controls-sheet__groups">
              {sourcesStrip(true)}
              <div className="ctrl-group ctrl-group--sheet">
                <button
                  className={`ctrl-btn ${isCamOff ? 'ctrl-btn--off' : ''}`}
                  onClick={onToggleCam}
                  title={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
                >
                  {isCamOff ? <CamOffIcon /> : <CamIcon />}
                  <span>{isCamOff ? 'Включить' : 'Камера'}</span>
                </button>
                <button
                  type="button"
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
                    videoQualityTier={presetToSimpleTier(activePreset)}
                    onVideoQualityTierChange={(tier) => { void onChangePreset(simpleTierToPreset(tier)) }}
                    mirrorLocalPreview={mirrorLocalCamera}
                    onToggleMirrorLocalPreview={onToggleMirrorLocalCamera}
                  />
                )}
              </div>
              <div className="ctrl-group ctrl-group--sheet">
                <button
                  className={`ctrl-btn ${isMuted ? 'ctrl-btn--off' : ''}`}
                  onClick={onToggleMute}
                  title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
                >
                  {isMuted ? <MicOffIcon /> : <MicIcon />}
                  <span>{isMuted ? 'Включить' : 'Микрофон'}</span>
                </button>
                <button
                  type="button"
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
                    audioMeter={showMeter}
                    onToggleAudioMeter={onToggleMeter}
                  />
                )}
              </div>
              {headphonesGroup(true)}
              {chatGroup(true)}
              {layoutGroup(true)}
              {screenShareGroup(true)}
              {settingsGroup(true)}
              {reactionGroup(true)}
              <div className="mobile-controls-sheet__leave-wrap">
                <button type="button" className="ctrl-btn ctrl-btn--leave ctrl-btn--leave-sheet" onClick={() => { closeMobileMore(); onLeaveRequest() }}>
                  <LeaveIcon />
                  <span>Выйти</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ProgramSpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}

function ProgramSpeakerMutedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
  )
}

function MenuHamburgerIcon() {
  return (
    <svg className="ctrl-mobile-fab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
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
  useOnOutsideClick(ref, onClose)

  const rows: { mode: LayoutMode; label: string }[] = [
    { mode: 'grid', label: 'Плитки' },
    { mode: 'meet', label: 'Лента' },
    { mode: 'speaker', label: 'Спикер' },
    { mode: 'pip', label: 'Картинка в картинке' },
    { mode: 'facetile', label: 'Мобильное' },
  ]

  return (
    <div className="device-popover device-popover--layout-pick" ref={ref}>
      <div className="device-popover__title">Раскладка</div>
      {rows.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          className={`device-popover__item device-popover__item--text-only${layout === mode ? ' device-popover__item--active' : ''}`}
          onClick={() => onPick(mode)}
        >
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
  useOnOutsideClick(ref, onClose)

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
  useOnOutsideClick(ref, onClose)

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
  chatToastNotifications,
  onToggleChatToastNotifications,
  onClose,
}: {
  chatEmbed: boolean
  onToggleChatEmbed: () => void
  chatToastNotifications: boolean
  onToggleChatToastNotifications: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useOnOutsideClick(ref, onClose)

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover__title">Чат</div>
      <div className="settings-row settings-row--pill">
        <span className="settings-label">Закрепить чат</span>
        <PillToggle
          compact
          checked={chatEmbed}
          onCheckedChange={() => onToggleChatEmbed()}
          ariaLabel="Закрепить чат в интерфейсе комнаты"
        />
      </div>
      <div className="settings-row settings-row--pill">
        <span className="settings-label">Показывать уведомления</span>
        <PillToggle
          compact
          checked={chatToastNotifications}
          onCheckedChange={() => onToggleChatToastNotifications()}
          ariaLabel="Всплывающие уведомления о новых сообщениях в чате"
        />
      </div>
    </div>
  )
}

function SettingsPopover({
  showInfo, onToggleInfo,
  showButtonLabels, onToggleButtonLabels,
  onResetView, onOpenServerSettings, onClose,
  viewportMobile,
  immersiveAutoHide,
  onToggleImmersiveAutoHide,
  streamerMode,
  onStreamerModeChange,
}: {
  showInfo: boolean
  onToggleInfo: () => void
  showButtonLabels: boolean
  onToggleButtonLabels: () => void
  onResetView: () => void
  onOpenServerSettings: () => void
  onClose: () => void
  viewportMobile: boolean
  immersiveAutoHide: boolean
  onToggleImmersiveAutoHide: () => void
  streamerMode: boolean
  onStreamerModeChange?: (value: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useOnOutsideClick(ref, onClose)

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover__title">Настройки</div>

      <button type="button" className="settings-row settings-row--btn settings-row--server" onClick={onOpenServerSettings}>
        <span className="settings-label">Настройки сервера</span>
        <span className="settings-row__arrow" aria-hidden>→</span>
      </button>

      {viewportMobile && onStreamerModeChange ? (
        <div className="settings-row settings-row--pill">
          <span className="settings-label">Стример</span>
          <PillToggle
            compact
            checked={streamerMode}
            onCheckedChange={(v) => onStreamerModeChange(v)}
            ariaLabel={streamerMode ? 'Режим стримера включён' : 'Режим стримера выключен'}
          />
        </div>
      ) : null}

      <div className="settings-row settings-row--pill">
        <span className="settings-label">Скрывать панели</span>
        <PillToggle
          compact
          checked={immersiveAutoHide}
          onCheckedChange={() => onToggleImmersiveAutoHide()}
          ariaLabel="Автоскрытие шапки и панели управления; тап по видео — показать"
        />
      </div>

      <div className="settings-row settings-row--pill">
        <span className="settings-label">Инфо</span>
        <PillToggle
          compact
          checked={showInfo}
          onCheckedChange={() => onToggleInfo()}
          ariaLabel="Информация на видео"
        />
      </div>

      <div className="settings-row settings-row--pill">
        <span className="settings-label">Подписи кнопок</span>
        <PillToggle
          compact
          checked={showButtonLabels}
          onCheckedChange={() => onToggleButtonLabels()}
          ariaLabel="Подписи кнопок панели управления"
        />
      </div>

      {/* Reset */}
      <button className="settings-row settings-row--btn settings-row--reset" onClick={onResetView}>
        <span className="settings-label">Сбросить вид</span>
      </button>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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
    <svg className="ctrl-chevron__glyph" width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
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
