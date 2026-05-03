import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react'
import { DevicePopover } from './DevicePopover'
import { PillToggle } from './PillToggle'
import { ScreenSharePickerModal } from './ScreenSharePickerModal'
import { ShareSourcePopover } from './ShareSourcePopover'
import type { VideoPreset } from '../types'
import { presetToSimpleTier, simpleTierToPreset } from '../utils/simpleVideoQuality'
import type { LayoutMode, VmixIngressPhase } from './RoomPage'
import type { SpaceRoomChatVisibility } from '../lib/spaceRoom'
import { SPACE_ROOM_CHAT_POLICY_SELECT_OPTIONS } from '../lib/spaceRoom'
import type { SpaceRoomAccessMode } from '../hooks/useSpaceRoomSettings'
import { ReactionEmojiPopover } from './ReactionEmojiPopover'
import {
  MicIcon,
  MicOffIcon,
  CamIcon,
  CamOffIcon,
  InviteIcon,
  FiRrIcon,
  ChatBubbleIcon,
} from './icons'
import { useOnOutsideClick } from '../hooks/useOnOutsideClick'
import { nextLayoutMode } from '../config/layoutModeCycle'

function layoutModeLabel(mode: LayoutMode): string {
  switch (mode) {
    case 'grid':
      return 'Плитки'
    case 'speaker':
      return 'Спикер'
    case 'pip':
      return 'Картинка в картинке'
    default:
      return 'Картинка в картинке'
  }
}

function LayoutModePickerIcon() {
  return <FiRrIcon name="grid" className="layout-mode-picker-icon" />
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
  onStartScreenShare: (surface?: 'monitor' | 'window' | 'browser', opts?: { maxBitrateBps?: number }) => void
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
  /** Горизонтальное зеркало только локального превью камеры (не влияет на исходящий поток). */
  mirrorLocalCamera: boolean
  onToggleMirrorLocalCamera: () => void
  /** Громкость аудио внешнего потока (SRT) (0…1), localStorage у каждого участника. */
  vmixProgramMuted: boolean
  onToggleVmixProgramMuted?: () => void
  /** Мобильный viewport: панель скрыта, меню только из FAB справа снизу. */
  forceMobileFabMenu: boolean
  viewportMobile: boolean
  immersiveAutoHide: boolean
  onToggleImmersiveAutoHide: () => void
  /** Автоскрытие шапки/панели — закрыть мобильное меню (бургер / «Ещё»). */
  chromeHidden: boolean
  /** Мобильный PiP: скопировать ссылку на комнату (кнопка «Добавить»). */
  onInviteParticipants?: () => void
  /** Долгое нажатие на ту же кнопку: пригласить друзей из контактов (если задано). */
  onInviteFromContacts?: () => void
  /** Мобильная нижняя панель: открыть лист «пригласить» (ссылка, ID, контакты) вместо долгого тапа. */
  onOpenMobileInviteSheet?: () => void
  /** Скрыть чат целиком (политика комнаты). */
  chatFeatureHidden?: boolean
  /** Текущая политика чата в space_rooms (для хоста). */
  roomChatVisibility?: SpaceRoomChatVisibility
  onRoomChatVisibilityChange?: (v: SpaceRoomChatVisibility) => void
  showRoomChatPolicySettings?: boolean
  /** Ссылка «Админка» в мобильном листе (superadmin / platform_admin / support_admin). */
  showAdminPanelLink?: boolean
  /** Режим доступа в комнату (для хоста). */
  roomAccessMode?: SpaceRoomAccessMode
  onRoomAccessModeChange?: (v: SpaceRoomAccessMode) => void
  /** Камера в плитках: true — без полей (cover), false — весь кадр (contain). */
  hideVideoLetterboxing: boolean
  onHideVideoLetterboxingChange: (value: boolean) => void
  /**
   * Остановить приём внешнего потока (SRT) и открыть параметры подключения (шеврон).
   * Только хост комнаты / админы (не гости без прав).
   */
  canManageVmixProgramIngress?: boolean
  /** Мобильная нижняя панель: кнопка смены вида (стример / админ). */
  showMobileLayoutCycle?: boolean
  /** Кнопка «Студия» рядом с SRT (режим стримера и права хоста/админа). */
  showStudioEntry?: boolean
  studioOpen?: boolean
  onStudioToggle?: () => void
  /** Личные «Настройки»: скрыть тумблер «Инфо» (перенесён в шапку «Комната»). */
  hidePersonalVideoInfoToggle?: boolean
  /** Меню «Чат»: скрыть политику комнаты (она в шапке). */
  hideHostRoomPoliciesInChat?: boolean
}

const LONG_PRESS_MS = 550

function controlsBarNoop() {}

function useMobileDualAction(onShort: () => void, onLong: () => void) {
  const timer = useRef(0)
  const longFired = useRef(false)
  const touchHandledAt = useRef(0)
  const shortRef = useRef(onShort)
  const longRef = useRef(onLong)
  shortRef.current = onShort
  longRef.current = onLong
  const startPress = useCallback(() => {
    longFired.current = false
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      longFired.current = true
      timer.current = 0
      longRef.current()
    }, LONG_PRESS_MS)
  }, [])
  const finishPress = useCallback((triggerShort: boolean) => {
    window.clearTimeout(timer.current)
    timer.current = 0
    if (triggerShort && !longFired.current) shortRef.current()
    longFired.current = false
  }, [])

  const shouldIgnoreMouse = useCallback(() => Date.now() - touchHandledAt.current < 750, [])
  return useMemo(
    () => ({
      onTouchStart(e: ReactTouchEvent<HTMLButtonElement>) {
        touchHandledAt.current = Date.now()
        e.preventDefault()
        e.stopPropagation()
        startPress()
      },
      onTouchEnd(e: ReactTouchEvent<HTMLButtonElement>) {
        touchHandledAt.current = Date.now()
        e.preventDefault()
        e.stopPropagation()
        finishPress(true)
      },
      onTouchCancel(e: ReactTouchEvent<HTMLButtonElement>) {
        touchHandledAt.current = Date.now()
        e.preventDefault()
        finishPress(false)
      },
      onClick(e: ReactMouseEvent<HTMLButtonElement>) {
        if (shouldIgnoreMouse()) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
      onMouseDown(e: ReactMouseEvent<HTMLButtonElement>) {
        if (shouldIgnoreMouse()) {
          e.preventDefault()
          return
        }
        if (e.button !== 0) return
        startPress()
      },
      onMouseUp(e: ReactMouseEvent<HTMLButtonElement>) {
        if (shouldIgnoreMouse()) {
          e.preventDefault()
          return
        }
        finishPress(true)
      },
      onMouseLeave() {
        finishPress(false)
      },
      onContextMenu(e: ReactMouseEvent<HTMLButtonElement>) {
        e.preventDefault()
      },
    }),
    [finishPress, shouldIgnoreMouse, startPress],
  )
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
  mirrorLocalCamera,
  onToggleMirrorLocalCamera,
  vmixProgramMuted,
  onToggleVmixProgramMuted,
  forceMobileFabMenu,
  viewportMobile,
  immersiveAutoHide,
  onToggleImmersiveAutoHide,
  chromeHidden,
  onInviteParticipants,
  onInviteFromContacts,
  onOpenMobileInviteSheet,
  chatFeatureHidden = false,
  roomChatVisibility,
  onRoomChatVisibilityChange,
  showRoomChatPolicySettings = false,
  roomAccessMode,
  onRoomAccessModeChange,
  hideVideoLetterboxing,
  onHideVideoLetterboxingChange,
  canManageVmixProgramIngress = false,
  showMobileLayoutCycle = false,
  showStudioEntry = false,
  studioOpen = false,
  onStudioToggle,
  hidePersonalVideoInfoToggle = false,
  hideHostRoomPoliciesInChat = false,
}: Props) {
  const [open, setOpen] = useState<OpenPopover>(null)
  const [screenPickerOpen, setScreenPickerOpen] = useState(false)
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
    if (!chromeHidden) return
    setOpen(null)
  }, [chromeHidden])

  useEffect(() => {
    if (!forceMobileFabMenu || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [forceMobileFabMenu, open])

  const camPress = useMobileDualAction(onToggleCam, () => setOpen('cam'))
  const micPress = useMobileDualAction(onToggleMute, () => setOpen('mic'))
  const hpPress = useMobileDualAction(togglePlayoutMute, () => setOpen('headphones'))
  const invitePress = useMobileDualAction(
    onInviteParticipants ?? controlsBarNoop,
    onInviteFromContacts ?? controlsBarNoop,
  )

  const showMainBar = !forceMobileFabMenu

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

  const chatGroup = (sheet?: boolean) =>
    chatFeatureHidden ? null : (
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
          roomChatVisibility={roomChatVisibility}
          onRoomChatVisibilityChange={onRoomChatVisibilityChange}
          showRoomChatPolicySettings={showRoomChatPolicySettings}
          hideHostRoomPolicies={hideHostRoomPoliciesInChat}
          roomAccessMode={roomAccessMode}
          onRoomAccessModeChange={onRoomAccessModeChange}
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
          onPick={(surface) => {
            if (canStartScreenShare) {
              Promise.resolve(onStartScreenShare(surface)).catch((e: unknown) => {
                console.error('[ui] onStartScreenShare failed', e)
              })
            }
            setOpen(null)
          }}
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
          hideVideoInfoToggle={hidePersonalVideoInfoToggle}
          showInfo={showInfo}
          onToggleInfo={onToggleInfo}
          showButtonLabels={showButtonLabels}
          onToggleButtonLabels={onToggleButtonLabels}
          onResetView={() => { onResetView(); setOpen(null) }}
          onClose={() => setOpen(null)}
          viewportMobile={viewportMobile}
          immersiveAutoHide={immersiveAutoHide}
          onToggleImmersiveAutoHide={onToggleImmersiveAutoHide}
          streamerMode={streamerMode}
          onStreamerModeChange={onStreamerModeChange}
          hideVideoLetterboxing={hideVideoLetterboxing}
          onHideVideoLetterboxingChange={onHideVideoLetterboxingChange}
        />
      )}
    </div>
  )

  const vmixProgramAudioControls = () => (
    <div
      className={`ctrl-vmix-audio ctrl-vmix-audio--${vmixPhase === 'live' ? 'live' : 'waiting'}`}
      role="group"
      aria-label="Звук внешнего потока (SRT)"
    >
      {canManageVmixProgramIngress ? (
        <button
          type="button"
          className={`ctrl-vmix-audio__mute${vmixProgramMuted ? ' ctrl-vmix-audio__mute--off' : ''}`}
          title={
            vmixProgramMuted
              ? 'Включить звук внешнего потока (SRT) для всех'
              : 'Отключить звук внешнего потока (SRT) для всех'
          }
          aria-pressed={vmixProgramMuted}
          disabled={vmixIngressLoading}
          onClick={onToggleVmixProgramMuted ?? controlsBarNoop}
        >
          {vmixProgramMuted ? <ProgramSpeakerMutedIcon /> : <ProgramSpeakerIcon />}
          <span className="ctrl-vmix-audio__label">
            {vmixProgramMuted ? 'Внешний поток: звук выкл (всем)' : 'Внешний поток: звук вкл (всем)'}
          </span>
        </button>
      ) : null}
    </div>
  )

  /**
   * Кнопка «добавить SRT» — только в режиме «стример» (локально).
   * При live/waiting: полная полоса (стоп + звук + шеврон) только с canManageVmixProgramIngress; иначе только звук.
   */
  const vmixSourcesBlock = (sheet?: boolean) => {
    const shClass = sh('ctrl-group ctrl-group--vmix-source', sheet)
    if (vmixPhase === 'idle') {
      if (!streamerMode) return null
      return (
        <button
          type="button"
          className={`ctrl-btn ctrl-btn--source-ingest ctrl-btn--source-ingest--vmix${vmixIngressLoading ? ' ctrl-btn--loading' : ''}`}
          title={vmixIngressLoading ? 'Подключение…' : 'Добавить источник SRT'}
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
        ? 'Внешний поток (SRT) активен. Нажмите, чтобы остановить'
        : 'Ожидание внешнего потока (SRT). Нажмите, чтобы остановить'
    if (!canManageVmixProgramIngress) {
      return <div className={shClass}>{vmixProgramAudioControls()}</div>
    }
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
        {vmixProgramAudioControls()}
        <button
          type="button"
          className={`ctrl-chevron ${chevronPhase}`}
          disabled={vmixIngressLoading}
          onClick={() => onOpenVmixSettings()}
          title="Параметры подключения SRT"
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

  const sourcesStrip = (sheet: boolean) => {
    const vmixStrip = vmixSourcesBlock(sheet)
    const studioBtn =
      streamerMode && showStudioEntry && onStudioToggle ? (
        <button
          type="button"
          className={`ctrl-btn ctrl-btn--source-ingest ctrl-btn--studio${studioOpen ? ' ctrl-btn--studio--open' : ''}`}
          onClick={onStudioToggle}
          title={studioOpen ? 'Закрыть студию' : 'Режим «Студия»'}
        >
          <FiRrIcon name="clapperboard" className="ctrl-btn__studio-fi" aria-hidden />
        </button>
      ) : null
    if (!vmixStrip && !studioBtn) return null
    return (
      <div className={`controls-bar__sources${sheet ? ' controls-bar__sources--in-sheet' : ''}`} aria-label="Внешние источники">
        {vmixStrip}
        {studioBtn}
      </div>
    )
  }

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
        <div className="ctrl-mobile-fab-popover-host">
          <div className="ctrl-mobile-bottom-bar" role="toolbar" aria-label="Управление комнатой">
            <div className="ctrl-mobile-bottom-bar__edge ctrl-mobile-bottom-bar__edge--left">
              <button
                type="button"
                className={`ctrl-mobile-bottom-bar__btn ctrl-mobile-bottom-bar__btn--compact${
                  playoutVolume < 0.02 ? ' ctrl-mobile-bottom-bar__btn--off' : ''
                }`}
                {...hpPress}
                title="Коротко: звук участников. Долго: устройство вывода"
                aria-label="Звук участников; долгое нажатие — выбор устройства вывода"
              >
                {playoutVolume < 0.02 ? <HeadphonesMutedIcon /> : <HeadphonesIcon />}
              </button>
            </div>
            <div className="ctrl-mobile-bottom-bar__center">
              <button
                type="button"
                className={`ctrl-mobile-bottom-bar__btn ctrl-mobile-bottom-bar__btn--main${
                  isCamOff ? ' ctrl-mobile-bottom-bar__btn--off' : ''
                }`}
                {...camPress}
                title="Коротко: камера. Долго: выбрать камеру"
                aria-label="Камера; долгое нажатие — выбор устройства"
              >
                {isCamOff ? <CamOffIcon /> : <CamIcon />}
              </button>
              <button
                type="button"
                className={`ctrl-mobile-bottom-bar__btn ctrl-mobile-bottom-bar__btn--main${
                  isMuted ? ' ctrl-mobile-bottom-bar__btn--off' : ''
                }`}
                {...micPress}
                title="Коротко: микрофон. Долго: выбрать микрофон"
                aria-label="Микрофон; долгое нажатие — выбор устройства"
              >
                {isMuted ? <MicOffIcon /> : <MicIcon />}
              </button>
              {onInviteParticipants ? (
                <button
                  type="button"
                  className="ctrl-mobile-bottom-bar__btn ctrl-mobile-bottom-bar__btn--main"
                  {...(forceMobileFabMenu && onOpenMobileInviteSheet
                    ? {
                        onClick: () => {
                          setOpen(null)
                          onOpenMobileInviteSheet()
                        },
                      }
                    : invitePress)}
                  title={
                    forceMobileFabMenu && onOpenMobileInviteSheet
                      ? 'Пригласить: ссылка, ID комнаты или контакты'
                      : onInviteFromContacts
                        ? 'Коротко: скопировать ссылку. Долго: пригласить друзей из контактов'
                        : 'Скопировать ссылку на комнату'
                  }
                  aria-label="Пригласить участников"
                >
                  <InviteIcon />
                </button>
              ) : null}
              <button
                type="button"
                className="ctrl-mobile-bottom-bar__btn ctrl-mobile-bottom-bar__btn--main ctrl-mobile-bottom-bar__btn--end-call"
                onClick={onLeaveRequest}
                title="Выйти из комнаты"
                aria-label="Выйти из комнаты"
              >
                <LeaveIcon />
              </button>
            </div>
            <div className="ctrl-mobile-bottom-bar__edge ctrl-mobile-bottom-bar__edge--right">
              {streamerMode && showStudioEntry && onStudioToggle ? (
                <button
                  type="button"
                  className={`ctrl-mobile-bottom-bar__btn ctrl-mobile-bottom-bar__btn--compact${studioOpen ? ' ctrl-mobile-bottom-bar__btn--studio-on' : ''}`}
                  onClick={onStudioToggle}
                  title={studioOpen ? 'Закрыть студию' : 'Режим «Студия»'}
                  aria-label={studioOpen ? 'Закрыть студию' : 'Открыть режим «Студия»'}
                >
                  <FiRrIcon name="clapperboard" className="ctrl-mobile-studio-fi" />
                </button>
              ) : null}
              {showMobileLayoutCycle ? (
                <button
                  type="button"
                  className="ctrl-mobile-bottom-bar__btn ctrl-mobile-bottom-bar__btn--compact"
                  onClick={() => onLayoutChange(nextLayoutMode(layout))}
                  title={`Сейчас: ${layoutModeLabel(layout)}. Далее: ${layoutModeLabel(nextLayoutMode(layout))}`}
                  aria-label="Сменить вид отображения"
                >
                  <LayoutModePickerIcon />
                </button>
              ) : null}
            </div>
          </div>
          {open === 'cam' && forceMobileFabMenu ? (
            <DevicePopover
              label="Камера"
              devices={cameras}
              selectedId={selectedCameraId}
              onSelect={(id) => { onSwitchCamera(id) }}
              onClose={() => setOpen(null)}
              videoQualityTier={presetToSimpleTier(activePreset)}
              onVideoQualityTierChange={(tier) => { void onChangePreset(simpleTierToPreset(tier)) }}
              mirrorLocalPreview={mirrorLocalCamera}
              onToggleMirrorLocalPreview={onToggleMirrorLocalCamera}
            />
          ) : null}
          {open === 'mic' && forceMobileFabMenu ? (
            <DevicePopover
              label="Микрофон"
              devices={microphones}
              selectedId={selectedMicId}
              onSelect={(id) => { onSwitchMic(id) }}
              onClose={() => setOpen(null)}
              audioMeter={showMeter}
              onToggleAudioMeter={onToggleMeter}
            />
          ) : null}
          {open === 'headphones' && forceMobileFabMenu ? (
            <PlayoutPopover
              onClose={() => setOpen(null)}
              playoutVolume={playoutVolume}
              onPlayoutVolumeChange={onPlayoutVolumeChange}
              audioOutputs={audioOutputs}
              playoutSinkId={playoutSinkId}
              onPlayoutSinkChange={onPlayoutSinkChange}
            />
          ) : null}
        </div>
      ) : null}

      {screenPickerOpen && (
        <ScreenSharePickerModal
          onClose={() => setScreenPickerOpen(false)}
          onPickSurface={(surface, opts) => {
            setScreenPickerOpen(false)
            Promise.resolve(onStartScreenShare(surface, opts)).catch((e: unknown) => {
              console.error('[ui] onStartScreenShare failed', e)
            })
          }}
        />
      )}

      {!forceMobileFabMenu && (
        <div className="controls-bar__reaction-floater">
          {reactionGroup()}
        </div>
      )}

    </div>
  )
}

function ProgramSpeakerIcon() {
  return <FiRrIcon name="speaker" className="ctrl-playout-fi" />
}

function ProgramSpeakerMutedIcon() {
  return <FiRrIcon name="volume-slash" className="ctrl-playout-fi" />
}

function ReactionEmojiIcon() {
  return <FiRrIcon name="smile" />
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
    { mode: 'speaker', label: 'Спикер' },
    { mode: 'pip', label: 'Картинка в картинке' },
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
      {audioOutputs.length > 0 ? (
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
      ) : (
        <div className="device-popover__section device-popover__section--hint">
          Переключение устройства вывода недоступно в этом браузере
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
  roomChatVisibility,
  onRoomChatVisibilityChange,
  showRoomChatPolicySettings = false,
  hideHostRoomPolicies = false,
  roomAccessMode,
  onRoomAccessModeChange,
}: {
  chatEmbed: boolean
  onToggleChatEmbed: () => void
  chatToastNotifications: boolean
  onToggleChatToastNotifications: () => void
  onClose: () => void
  roomChatVisibility?: SpaceRoomChatVisibility
  onRoomChatVisibilityChange?: (v: SpaceRoomChatVisibility) => void
  showRoomChatPolicySettings?: boolean
  /** Политика чата и вход перенесены в «Комната». */
  hideHostRoomPolicies?: boolean
  roomAccessMode?: SpaceRoomAccessMode
  onRoomAccessModeChange?: (v: SpaceRoomAccessMode) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useOnOutsideClick(ref, onClose)

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover__title">Чат</div>
      <div className="settings-row settings-row--pill">
        <span className="settings-label">Фиксировать панель чата</span>
        <PillToggle
          compact
          checked={chatEmbed}
          onCheckedChange={() => onToggleChatEmbed()}
          ariaLabel="Зафиксировать панель чата в интерфейсе комнаты"
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
      {!hideHostRoomPolicies &&
      showRoomChatPolicySettings &&
      roomChatVisibility &&
      onRoomChatVisibilityChange ? (
        <div className="settings-popover__section settings-popover__section--bordered">
          <span className="device-popover__label">Кто может пользоваться чатом</span>
          <select
            className="settings-select device-popover__select-full"
            value={roomChatVisibility}
            onChange={(e) => {
              onRoomChatVisibilityChange(e.target.value as SpaceRoomChatVisibility)
            }}
            aria-label="Политика чата для всех участников"
          >
            {SPACE_ROOM_CHAT_POLICY_SELECT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {!hideHostRoomPolicies && onRoomAccessModeChange ? (
        <div className="settings-popover__section settings-popover__section--bordered">
          <div className="settings-popover__subtitle">Вход в комнату</div>
          <div className="settings-row settings-row--pill">
            <span className="settings-label">
              Одобрять вход вручную
            </span>
            <PillToggle
              compact
              checked={roomAccessMode === 'approval'}
              onCheckedChange={(checked) =>
                onRoomAccessModeChange(checked ? 'approval' : 'link')
              }
              ariaLabel="Требовать одобрения хоста для входа в комнату"
            />
          </div>
          {roomAccessMode === 'approval' ? (
            <p className="settings-popover__hint">
              Гости будут видеть экран ожидания, а вы — запросы на вход
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SettingsPopover({
  hideVideoInfoToggle = false,
  showInfo, onToggleInfo,
  showButtonLabels, onToggleButtonLabels,
  onResetView, onClose,
  viewportMobile,
  immersiveAutoHide,
  onToggleImmersiveAutoHide,
  streamerMode,
  onStreamerModeChange,
  hideVideoLetterboxing,
  onHideVideoLetterboxingChange,
}: {
  hideVideoInfoToggle?: boolean
  showInfo: boolean
  onToggleInfo: () => void
  showButtonLabels: boolean
  onToggleButtonLabels: () => void
  onResetView: () => void
  onClose: () => void
  viewportMobile: boolean
  immersiveAutoHide: boolean
  onToggleImmersiveAutoHide: () => void
  streamerMode: boolean
  onStreamerModeChange?: (value: boolean) => void
  hideVideoLetterboxing: boolean
  onHideVideoLetterboxingChange: (value: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useOnOutsideClick(ref, onClose)

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover__title">Настройки</div>

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
        <span className="settings-label">Скрывать поля</span>
        <PillToggle
          compact
          checked={hideVideoLetterboxing}
          onCheckedChange={(v) => onHideVideoLetterboxingChange(v)}
          ariaLabel={
            hideVideoLetterboxing
              ? 'Камера обрезается под плитку без чёрных полос'
              : 'Камера вписывается целиком, возможны поля по краям'
          }
        />
      </div>

      {!hideVideoInfoToggle ? (
        <div className="settings-row settings-row--pill">
          <span className="settings-label">Инфо</span>
          <PillToggle
            compact
            checked={showInfo}
            onCheckedChange={() => onToggleInfo()}
            ariaLabel="Информация на видео"
          />
        </div>
      ) : null}

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
  return <FiRrIcon name="circle-phone-hangup" />
}

function ScreenShareIcon() {
  return <FiRrIcon name="screen" />
}

function ChevronIcon() {
  return <FiRrIcon name="angle-small-down" className="ctrl-chevron__glyph" />
}

function HeadphonesIcon() {
  return <FiRrIcon name="headphones" />
}

function HeadphonesMutedIcon() {
  return <FiRrIcon name="volume-mute" />
}

function GearIcon() {
  return <FiRrIcon name="settings" />
}
