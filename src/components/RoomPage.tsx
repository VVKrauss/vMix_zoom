import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import React from 'react'
import { BrandLogoLoader } from './BrandLogoLoader'
import { GridTilePlaceholder } from './GridTilePlaceholder'
import { ConfirmDialog } from './ConfirmDialog'
import { ControlsBar } from './ControlsBar'
import { ParticipantCard } from './ParticipantCard'
import { DraggablePip } from './DraggablePip'
import { AudioMeter } from './AudioMeter'
  import {
    MicOffIcon,
    DashboardIcon,
    InviteIcon,
    ParticipantsBadgeIcon,
    ChatBubbleIcon,
    FullscreenEnterIcon,
    FullscreenExitIcon,
  } from './icons'
import { useAuth } from '../context/AuthContext'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import { useAudioOutputs } from '../hooks/useAudioOutputs'
import { useDevices } from '../hooks/useDevices'
import {
  getDefaultLayoutMode,
  readStoredLayoutMode,
  writeStoredLayoutMode,
  readStoredPipLayout,
  writeStoredPipLayout,
  readStoredHideVideoLetterboxing,
  writeStoredHideVideoLetterboxing,
} from '../config/roomUiStorage'
import { mediaQueryMaxWidthMobile } from '../config/uiBreakpoints'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import {
  useLocalStorageNumber,
  useLocalStorageString,
  useLocalStorageBool,
} from '../hooks/useLocalStorage'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import { SrtCopySurface } from './SrtCopyMenu'
import type { PipPos, PipSize } from './DraggablePip'
import type { RemoteParticipant, SrtSessionInfo, VideoPreset, VmixIngressInfo } from '../types'
import type { InboundVideoQuality } from '../utils/inboundVideoStats'
import { ruParticipantsWord } from '../utils/ruPlural'
import {
  isScreenTileId,
  localScreenTileKey,
  parseScreenTilePeerId,
  screenTileKey,
} from '../utils/screenTileKey'
import {
  isStudioProgramTileId,
  parseStudioProgramTilePeerId,
  studioProgramTileKey,
} from '../utils/studioProgramTileKey'
import { LocalScreenShareTile } from './LocalScreenShareTile'
import { StudioProgramShareTile } from './StudioProgramShareTile'
import type { RoomChatMessage, RoomReactionBurst } from '../types/roomComms'
import { pickLatestBurstForPeer } from '../types/roomComms'
import { ParticipantTileIdle } from './ParticipantTileIdle'
import { RoomChatPanel } from './RoomChatPanel'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'
import { VmixIngressModal } from './VmixIngressModal'
import { RoomInviteFriendsModal } from './RoomInviteFriendsModal'
import { PillToggle } from './PillToggle'
import { ThemeToggle } from './ThemeToggle'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useActiveSpeaker } from '../hooks/useActiveSpeaker'
import { buildRoomInviteAbsoluteUrl } from '../utils/soloViewerParams'
  import { useTouchDoubleTap } from '../hooks/useTouchDoubleTap'
  import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { nextLayoutMode } from '../config/layoutModeCycle'
import { useRoomUiSync } from '../hooks/useRoomUiSync'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useProfile } from '../hooks/useProfile'
import { useIsDbSpaceRoomHost } from '../hooks/useSpaceRoomHost'
import { useSpaceRoomSettings } from '../hooks/useSpaceRoomSettings'
import {
  isSessionHostFor,
  clearHostSessionIfMatches,
  participantCanPostRoomChat,
  participantCanSeeRoomChat,
  updateSpaceRoomChatVisibility,
  approveSpaceRoomJoiner,
  removeSpaceRoomApprovedJoiner,
  banUserFromSpaceRoom,
  type SpaceRoomChatVisibility,
} from '../lib/spaceRoom'
import { supabase } from '../lib/supabase'
import type { StudioOutputPreset } from '../types/studio'
import { getContactStatuses, setUserFavorite, type ContactStatus } from '../lib/socialGraph'

/** Входящий запрос на вход в комнату (access_mode=approval). */
interface JoinRequest {
  requestId: string
  userId: string | null
  displayName: string
  receivedAt: number
}

const StudioModeWorkspace = lazy(async () => {
  const mod = await import('./studio/StudioModeWorkspace')
  return { default: mod.StudioModeWorkspace }
})

function LayoutCycleFabButton({
  className = '',
  onPickNextLayout,
}: {
  className?: string
  onPickNextLayout: () => void
}) {
  return (
    <button
      type="button"
      className={`room-layout-cycle-fab${className ? ` ${className}` : ''}`}
      onClick={onPickNextLayout}
      title="Сменить вид отображения"
      aria-label="Сменить вид отображения"
    >
      <svg className="room-layout-cycle-fab__icon" width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <rect x="0.5" y="0.5" width="6" height="6" rx="0.75" fill="none" stroke="currentColor" strokeWidth="1" />
        <rect x="9" y="0" width="7" height="7" rx="0.75" />
        <rect x="0" y="9" width="7" height="7" rx="0.75" />
        <rect x="9" y="9" width="7" height="7" rx="0.75" />
      </svg>
    </button>
  )
}

function remoteScreenTileId(p: RemoteParticipant): string | null {
  if (!p.screenStream) return null
  return p.screenPeerId ?? screenTileKey(p.peerId)
}

function remoteStudioProgramTileId(p: RemoteParticipant): string | null {
  if (p.virtualSourceType === 'studio_program') return null
  if (!p.studioProgramStream) return null
  return p.studioProgramPeerId ?? studioProgramTileKey(p.peerId)
}

/** peerId гостя для пункта «выключить звук гостю» (не локальная плитка). */
function guestMuteTargetPeerId(tileId: string, localPeerId: string): string | null {
  if (!tileId || tileId === localPeerId) return null
  if (isScreenTileId(tileId)) {
    const owner = parseScreenTilePeerId(tileId)
    if (!owner || owner === localPeerId) return null
    return owner
  }
  if (isStudioProgramTileId(tileId)) {
    const owner = parseStudioProgramTilePeerId(tileId)
    if (!owner || owner === localPeerId) return null
    return owner
  }
  return tileId
}

type DocumentWithFs = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void>
}

type ElementWithFs = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function getBrowserFullscreenElement(): Element | null {
  const d = document as DocumentWithFs
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null
}

function canToggleBrowserFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const d = document as DocumentWithFs
  const root = document.documentElement as ElementWithFs
  return Boolean(
    document.fullscreenEnabled ||
    d.webkitFullscreenEnabled ||
    document.exitFullscreen ||
    d.webkitExitFullscreen ||
    root.requestFullscreen ||
    root.webkitRequestFullscreen,
  )
}

export type LayoutMode = StoredLayoutMode

/** vMix: ingress запущен, но видео ещё нет — оранжевая кнопка; есть видео — красная. */
export type VmixIngressPhase = 'idle' | 'waiting' | 'live'

const SPEAKER_PIN_LONG_PRESS_MS = 550

function SpeakerStripTile({
  tileId,
  active,
  pinned,
  onTogglePin,
  children,
}: {
  tileId: string
  active: boolean
  pinned: boolean
  onTogglePin: (tileId: string) => void
  children: React.ReactNode
}) {
  const timerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const clearPressTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const togglePinned = useCallback(() => {
    clearPressTimer()
    onTogglePin(tileId)
  }, [clearPressTimer, onTogglePin, tileId])

  const startLongPress = useCallback(() => {
    clearPressTimer()
    timerRef.current = window.setTimeout(togglePinned, SPEAKER_PIN_LONG_PRESS_MS)
  }, [clearPressTimer, togglePinned])

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null
    startLongPress()
  }, [startLongPress])

  const handleTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    const touch = event.touches[0]
    if (!start || !touch) return
    const dx = Math.abs(touch.clientX - start.x)
    const dy = Math.abs(touch.clientY - start.y)
    if (dx > 10 || dy > 10) {
      clearPressTimer()
    }
  }, [clearPressTimer])

  const handleContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    togglePinned()
  }, [togglePinned])

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    startLongPress()
  }, [startLongPress])

  const handlePressEnd = useCallback(() => {
    touchStartRef.current = null
    clearPressTimer()
  }, [clearPressTimer])

  useEffect(() => clearPressTimer, [clearPressTimer])

  return (
    <div
      className={`room-speaker-strip-tile${active ? ' room-speaker-strip-tile--on-stage' : ''}${pinned ? ' room-speaker-strip-tile--pinned' : ''}`}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handlePressEnd}
      onTouchCancel={handlePressEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handlePressEnd}
      onMouseLeave={handlePressEnd}
      title={pinned ? 'Закреплено. Долгое нажатие или правая кнопка мыши — снять закреп.' : 'Долгое нажатие или правая кнопка мыши — закрепить на сцене.'}
      aria-label={pinned ? 'Снять закреп со сцены' : 'Закрепить на сцене'}
    >
      {children}
    </div>
  )
}
/** Раскладки с «плитками» (мобильное заполнение сетки). */
export function layoutUsesTiledView(mode: LayoutMode): boolean {
  return mode === 'grid'
}

interface Props {
  name: string
  localStream: MediaStream | null
  participants: Map<string, RemoteParticipant>
  roomId: string
  localPeerId: string
  srtByPeer: Record<string, SrtSessionInfo>
  isMuted: boolean
  isCamOff: boolean
  onToggleMute: () => void
  onToggleCam: () => void
  onLeave: () => void
  leaveEndsRoomForAll?: boolean
  onSwitchCamera: (id: string) => void
  onSwitchMic: (id: string) => void
  activePreset: VideoPreset
  onChangePreset: (p: VideoPreset) => void
  localScreenStream: MediaStream | null
  /** Отдельный peerId демонстрации с бэка; до ack — плитка по synthetic key. */
  localScreenPeerId: string | null
  isScreenSharing: boolean
  onToggleScreenShare: () => void
  onStartScreenShare: (surface?: 'monitor' | 'window' | 'browser') => void
  chatMessages: RoomChatMessage[]
  onSendChatMessage: (text: string) => void
  onSendReaction: (emoji: string) => void
  reactionBursts: RoomReactionBurst[]
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  chatUnreadCount: number
  chatIncomingPreview: { author: string; text: string } | null
  onDismissChatIncomingPreview: () => void
  chatToastNotifications: boolean
  onToggleChatToastNotifications: () => void
  /** У гостей: идёт приём newProducer экрана, ещё нет screenStream в state */
  remoteScreenSharePending?: boolean
  remoteStudioProgramConsumePending?: boolean
  /** Фаза RTMP эфира студии по peerId ведущего (для индикатора на плитке «Эфир»). */
  remoteStudioRtmpByPeer?: Readonly<Record<string, 'idle' | 'connecting' | 'live' | 'warning'>>
  vmixIngressInfo: VmixIngressInfo | null
  vmixIngressLoading: boolean
  onStartVmixIngress: () => Promise<{ ok: true; info: VmixIngressInfo } | { ok: false; error: string }>
  onStopVmixIngress: () => Promise<{ ok: boolean; error?: string }>
  /** Входящее camera/vmix видео по участнику (не локальная плитка, не экран). */
  getPeerUplinkVideoQuality?: (peerId: string) => Promise<InboundVideoQuality | null>
  /** Удалённое выключение микрофона гостя (сигналинг). */
  requestPeerMicMute?: (targetPeerId: string) => void
  /** Выгнать участника из комнаты (сигналинг). */
  requestKickPeer?: (targetPeerId: string) => void
  startStudioPreview: (videoTrack: MediaStreamTrack) => Promise<{ ok: boolean; error?: string }>
  stopStudioPreview: () => Promise<void>
  /** RTMP-эфир из режима «Студия». */
  startStudioProgram: (
    videoTrack: MediaStreamTrack,
    audioTrack: MediaStreamTrack | null,
    rtmpUrl: string,
    streamKey: string,
    output: StudioOutputPreset,
  ) => Promise<{ ok: boolean; error?: string; warning?: string }>
  stopStudioProgram: () => Promise<void>
  replaceStudioProgramAudioTrack: (track: MediaStreamTrack | null) => Promise<void>
  studioBroadcastHealth: 'idle' | 'connecting' | 'live' | 'warning'
  /** Пояснение с сервера (stderr FFmpeg и т.д.) при studioBroadcastHealth ≠ live. */
  studioBroadcastHealthDetail?: string | null
  studioServerLogLines?: readonly string[]
  connectionState?: 'connected' | 'reconnecting'
  reconnectAttempt?: number | null
}

export function RoomPage({
  name, localStream, participants,
  roomId, localPeerId, srtByPeer,
  isMuted, isCamOff,
  onToggleMute, onToggleCam, onLeave,
  leaveEndsRoomForAll = false,
  onSwitchCamera, onSwitchMic,
  activePreset, onChangePreset,
  localScreenStream, localScreenPeerId, isScreenSharing, onToggleScreenShare, onStartScreenShare,
  chatMessages, onSendChatMessage, onSendReaction, reactionBursts,
  chatOpen, setChatOpen, chatUnreadCount, chatIncomingPreview,
  onDismissChatIncomingPreview,
  chatToastNotifications, onToggleChatToastNotifications,
  remoteScreenSharePending = false,
  remoteStudioProgramConsumePending = false,
  remoteStudioRtmpByPeer = {},
  vmixIngressInfo,
  vmixIngressLoading,
  onStartVmixIngress,
  onStopVmixIngress,
  getPeerUplinkVideoQuality,
  requestPeerMicMute,
  requestKickPeer,
  startStudioPreview,
  stopStudioPreview,
  startStudioProgram,
  stopStudioProgram,
  replaceStudioProgramAudioTrack,
  studioBroadcastHealth,
  studioBroadcastHealthDetail = null,
  studioServerLogLines = [],
  connectionState = 'connected',
  reconnectAttempt = null,
}: Props) {
  const isViewportMobile = useMediaQuery(mediaQueryMaxWidthMobile)
  const [immersiveAutoHide, setImmersiveAutoHide] = useLocalStorageBool(
    'vmix_immersive_auto_hide',
    false,
  )
  const [chromeHidden, setChromeHidden] = useState(false)
  const chromeHiddenRef = useRef(false)
  const immersiveAutoHideRef = useRef(immersiveAutoHide)
  const hideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  useLayoutEffect(() => {
    chromeHiddenRef.current = chromeHidden
  }, [chromeHidden])

  useLayoutEffect(() => {
    immersiveAutoHideRef.current = immersiveAutoHide
  }, [immersiveAutoHide])

  const armImmersiveHideTimer = useCallback(() => {
    if (!immersiveAutoHideRef.current) return
    if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      setChromeHidden(true)
      hideTimerRef.current = null
    }, 5000)
  }, [])

  const showChromeAndArmImmersiveTimer = useCallback(() => {
    setChromeHidden(false)
    armImmersiveHideTimer()
  }, [armImmersiveHideTimer])

  const [layout, setLayout] = useState<LayoutMode>(() => {
    const mobile =
      typeof window !== 'undefined' && window.matchMedia(mediaQueryMaxWidthMobile).matches
    return readStoredLayoutMode(mobile) ?? getDefaultLayoutMode()
  })
  const [showInfo, setShowInfo] = useLocalStorageBool('vmix_show_video_info', false)
  const [showMeter, setShowMeter] = useLocalStorageBool('vmix_show_audio_meter', false)
  const [sourceAspect, setSourceAspect] = useState<number | null>(null)
  const [pipPos, setPipPos] = useState<PipPos>(() => {
    const mobile =
      typeof window !== 'undefined' && window.matchMedia(mediaQueryMaxWidthMobile).matches
    return readStoredPipLayout(mobile).pos
  })
  const [pipSize, setPipSize] = useState<PipSize>(() => {
    const mobile =
      typeof window !== 'undefined' && window.matchMedia(mediaQueryMaxWidthMobile).matches
    return readStoredPipLayout(mobile).size
  })
  const [showLayoutToggle, setShowLayoutToggle] = useState(true)
  const [hideVideoLetterboxing, setHideVideoLetterboxing] = useState(() =>
    typeof window !== 'undefined' ? readStoredHideVideoLetterboxing() : true,
  )

  useEffect(() => {
    writeStoredLayoutMode(layout, isViewportMobile)
  }, [layout, isViewportMobile])

  useEffect(() => {
    writeStoredPipLayout(pipPos, pipSize, isViewportMobile)
  }, [pipPos, pipSize, isViewportMobile])

  useEffect(() => {
    writeStoredHideVideoLetterboxing(hideVideoLetterboxing)
  }, [hideVideoLetterboxing])

  const [leaveDialog, setLeaveDialog] = useState<null | { mode: 'home' | 'leave'; others: number }>(null)
  const [screenStopDialogOpen, setScreenStopDialogOpen] = useState(false)
  const [vmixModalOpen, setVmixModalOpen] = useState(false)
  const [vmixModalMode, setVmixModalMode] = useState<'setup' | 'reference'>('setup')
  const [vmixStopDialogOpen, setVmixStopDialogOpen] = useState(false)
  const [vmixError, setVmixError] = useState<string | null>(null)
  const [inviteToast, setInviteToast] = useState<'url' | 'id' | null>(null)
  const inviteToastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [friendsInviteToast, setFriendsInviteToast] = useState<string | null>(null)
  const friendsInviteToastTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [inviteFriendsModalOpen, setInviteFriendsModalOpen] = useState(false)
  const [mobileInviteSheetOpen, setMobileInviteSheetOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const inviteRef = useRef<HTMLDivElement>(null)
  const [fullscreenActive, setFullscreenActive] = useState(false)
  const fullscreenSupported = canToggleBrowserFullscreen()

  useEffect(() => {
    if (!inviteOpen) return
    const handler = (e: MouseEvent) => {
      if (shouldClosePopoverOnOutsidePointer(inviteRef.current, e.target)) {
        setInviteOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [inviteOpen])

  const handleCopyInviteUrl = useCallback(() => {
    const id = roomId.trim()
    if (!id) return
    const url = buildRoomInviteAbsoluteUrl(id)
    void navigator.clipboard.writeText(url).then(
      () => {
        setInviteOpen(false)
        setMobileInviteSheetOpen(false)
        if (inviteToastTimerRef.current != null) window.clearTimeout(inviteToastTimerRef.current)
        setInviteToast('url')
        inviteToastTimerRef.current = window.setTimeout(() => {
          setInviteToast(null)
          inviteToastTimerRef.current = null
        }, 3800)
      },
      () => {},
    )
  }, [roomId])

  const handleCopyInviteId = useCallback(() => {
    const id = roomId.trim()
    if (!id) return
    void navigator.clipboard.writeText(id).then(
      () => {
        setInviteOpen(false)
        setMobileInviteSheetOpen(false)
        if (inviteToastTimerRef.current != null) window.clearTimeout(inviteToastTimerRef.current)
        setInviteToast('id')
        inviteToastTimerRef.current = window.setTimeout(() => {
          setInviteToast(null)
          inviteToastTimerRef.current = null
        }, 3800)
      },
      () => {},
    )
  }, [roomId])

  useEffect(() => () => {
    if (inviteToastTimerRef.current != null) window.clearTimeout(inviteToastTimerRef.current)
    if (friendsInviteToastTimerRef.current != null) window.clearTimeout(friendsInviteToastTimerRef.current)
  }, [])

  useEffect(() => {
    const sync = () => setFullscreenActive(Boolean(getBrowserFullscreenElement()))
    sync()
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const toggleBrowserFullscreen = useCallback(async () => {
    const d = document as DocumentWithFs
    const root = document.documentElement as ElementWithFs
    try {
      if (getBrowserFullscreenElement()) {
        if (document.exitFullscreen) await document.exitFullscreen()
        else await d.webkitExitFullscreen?.()
      } else if (root.requestFullscreen) {
        await root.requestFullscreen()
      } else {
        await Promise.resolve(root.webkitRequestFullscreen?.())
      }
    } catch {
      /* нет API, отклонено пользователем или iOS */
    }
  }, [])

  const mobilePresentationActive = fullscreenSupported
    ? fullscreenActive
    : immersiveAutoHide && chromeHidden

  const toggleMobilePresentationMode = useCallback(async () => {
    if (fullscreenSupported) {
      await toggleBrowserFullscreen()
      return
    }
    if (mobilePresentationActive) {
      setChromeHidden(false)
      return
    }
    if (!immersiveAutoHideRef.current) {
      setImmersiveAutoHide(true)
    }
    setChromeHidden(true)
  }, [fullscreenSupported, mobilePresentationActive, setImmersiveAutoHide, toggleBrowserFullscreen])

  const { audioOutputs, refreshAudioOutputs } = useAudioOutputs()
  const [playoutVolume, setPlayoutVolume] = useLocalStorageNumber('vmix_playout_volume', 1, 0, 1)
  /** Громкость только потока программы vMix (у каждого гостя своя, localStorage). */
  const [vmixProgramVolume, setVmixProgramVolume] = useLocalStorageNumber('vmix_program_volume', 1, 0, 1)
  const [vmixProgramMuted, setVmixProgramMuted] = useLocalStorageBool('vmix_program_muted', false)
  const [playoutSinkId, setPlayoutSinkId] = useLocalStorageString('vmix_playout_sink', '')
  const [showControlButtonLabels, setShowControlButtonLabels] = useLocalStorageBool('vmix_control_button_labels', false)
  const [chatEmbed, setChatEmbed] = useLocalStorageBool('vmix_chat_embed', true)
  const { user, signOut } = useAuth()
  const { allowed: canAccessAdminPanel, isSuperadmin } = useCanAccessAdminPanel()
  const { plan, profile } = useProfile()
  const isDbSpaceRoomHost = useIsDbSpaceRoomHost(roomId, user?.id)
  const [chatContactStatuses, setChatContactStatuses] = useState<Record<string, ContactStatus>>({})
  /** Запросы на вход (access_mode=approval) */
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  /** Тост «управление передано на другое устройство» */
  const [hostTransferredToast, setHostTransferredToast] = useState(false)
  const hostTransferToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Staff/superadmin по RPC + роли из профиля (если RPC отличается от `user_global_roles`). */
  const isPlatformAdminish = useMemo(
    () =>
      canAccessAdminPanel ||
      isSuperadmin ||
      (profile?.global_roles?.some(
        (r) =>
          r.code === 'superadmin' || r.code === 'platform_admin' || r.code === 'support_admin',
      ) ??
        false),
    [canAccessAdminPanel, isSuperadmin, profile?.global_roles],
  )

  const isStreamerPlan = useMemo(
    () => /стример|streamer/i.test(plan?.plan_name?.trim() ?? ''),
    [plan?.plan_name],
  )
  const isRoomHost = useMemo(
    () => isDbSpaceRoomHost || isSessionHostFor(roomId.trim()),
    [isDbSpaceRoomHost, roomId],
  )

  /**
   * Расширенные инструменты комнаты: любой админ (staff/superadmin/роли) ИЛИ подписка «стример» и хост комнаты.
   * Соло-ссылка, PiP-меню, выключение мика гостю, переключатель режима стримера, запуск SRT в idle.
   */
  const canUseElevatedRoomTools = useMemo(
    () => isPlatformAdminish || (isStreamerPlan && isRoomHost),
    [isPlatformAdminish, isStreamerPlan, isRoomHost],
  )

  const { row: spaceRoomRow } = useSpaceRoomSettings(roomId)
  const roomChatVisibility: SpaceRoomChatVisibility = spaceRoomRow?.chatVisibility ?? 'everyone'

  const chatParticipantCtx = useMemo(
    () => ({
      isAuthed: Boolean(user?.id),
      isDbHost: isDbSpaceRoomHost,
      isElevatedStaff: isPlatformAdminish,
    }),
    [user?.id, isDbSpaceRoomHost, isPlatformAdminish],
  )

  const canSeeRoomChat = useMemo(
    () => participantCanSeeRoomChat(roomChatVisibility, chatParticipantCtx),
    [roomChatVisibility, chatParticipantCtx],
  )

  const canPostRoomChat = useMemo(
    () => participantCanPostRoomChat(roomChatVisibility, chatParticipantCtx),
    [roomChatVisibility, chatParticipantCtx],
  )

  useEffect(() => {
    if (!canSeeRoomChat && chatOpen) setChatOpen(false)
  }, [canSeeRoomChat, chatOpen, setChatOpen])

  const handleRoomChatVisibilityChange = useCallback(
    async (v: SpaceRoomChatVisibility) => {
      if (!user?.id || !isDbSpaceRoomHost) return
      const ok = await updateSpaceRoomChatVisibility(roomId.trim(), user.id, v)
      if (!ok) console.warn('room chat policy: update failed')
    },
    [user?.id, isDbSpaceRoomHost, roomId],
  )

  // Supabase Realtime broadcast-канал комнаты: join-requests и host-transfer
  useEffect(() => {
    const slug = roomId.trim()
    if (!slug) return

    const ch = supabase
      .channel(`room-mod:${slug}`)
      .on('broadcast', { event: 'join-request' }, (msg) => {
        if (!isDbSpaceRoomHost) return
        const payload = msg.payload as { requestId?: string; userId?: string | null; displayName?: string } | null
        const requestId = typeof payload?.requestId === 'string' ? payload.requestId : `${Date.now()}`
        const userId = typeof payload?.userId === 'string' ? payload.userId : null
        const displayName = typeof payload?.displayName === 'string' && payload.displayName
          ? payload.displayName
          : userId ?? 'Участник'
        setJoinRequests((prev) => {
          if (prev.some((r) => r.requestId === requestId)) return prev
          return [...prev, { requestId, userId, displayName, receivedAt: Date.now() }]
        })
      })
      .on('broadcast', { event: 'host-transfer-claimed' }, () => {
        // Управление перехвачено другим устройством — очищаем session host
        clearHostSessionIfMatches(slug)
        setHostTransferredToast(true)
        if (hostTransferToastTimerRef.current) clearTimeout(hostTransferToastTimerRef.current)
        hostTransferToastTimerRef.current = setTimeout(() => {
          setHostTransferredToast(false)
        }, 6000)
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(ch)
      if (hostTransferToastTimerRef.current) clearTimeout(hostTransferToastTimerRef.current)
    }
  }, [roomId, isDbSpaceRoomHost])

  const handleApproveJoinRequest = useCallback(
    async (req: JoinRequest) => {
      if (!user?.id || !req.userId) return
      const ok = await approveSpaceRoomJoiner(roomId.trim(), user.id, req.userId)
      if (ok) {
        setJoinRequests((prev) => prev.filter((r) => r.requestId !== req.requestId))
      }
    },
    [roomId, user?.id],
  )

  const handleDenyJoinRequest = useCallback(
    async (req: JoinRequest) => {
      const slug = roomId.trim()
      if (!slug) return
      // Убираем из approved_joiners если случайно попал
      if (req.userId && user?.id) {
        void removeSpaceRoomApprovedJoiner(slug, user.id, req.userId)
      }
      // Уведомляем гостя через broadcast
      const ch = supabase.channel(`room-mod:${slug}`)
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void ch
            .send({
              type: 'broadcast',
              event: 'join-request-denied',
              payload: { requestId: req.requestId, userId: req.userId },
            })
            .then(() => void supabase.removeChannel(ch))
        }
      })
      setJoinRequests((prev) => prev.filter((r) => r.requestId !== req.requestId))
    },
    [roomId, user?.id],
  )

  const handleBanPeer = useCallback(
    async (targetPeerId: string, targetAuthUserId: string) => {
      if (!user?.id || !isDbSpaceRoomHost) return
      await banUserFromSpaceRoom(roomId.trim(), user.id, targetAuthUserId)
      if (requestKickPeer) requestKickPeer(targetPeerId)
    },
    [roomId, user?.id, isDbSpaceRoomHost, requestKickPeer],
  )

  const sendChatGuarded = useCallback(
    (text: string) => {
      if (!canPostRoomChat) return
      onSendChatMessage(text)
    },
    [canPostRoomChat, onSendChatMessage],
  )

  const chatComposerLocked = canSeeRoomChat && !canPostRoomChat
  const chatComposerHint = chatComposerLocked
    ? roomChatVisibility === 'closed'
      ? 'Хост отключил отправку сообщений для всех.'
      : 'Отправка сообщений недоступна в текущем режиме чата.'
    : null

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined
  const messengerUnreadCount = useMessengerUnreadCount()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (shouldClosePopoverOnOutsidePointer(userMenuRef.current, e.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  useRoomUiSync({
    user: user ?? null,
    isViewportMobile,
    layout,
    pipPos,
    pipSize,
    showLayoutToggle,
    hideVideoLetterboxing,
    setLayout,
    setPipPos,
    setPipSize,
    setShowLayoutToggle,
    setHideVideoLetterboxing,
  })

  const [streamerMode, setStreamerMode] = useLocalStorageBool('vmix_streamer_mode', false)
  const [studioOpen, setStudioOpen] = useState(false)
  /** Только локальное превью; отправляемый поток без отражения. */
  const [mirrorLocalCamera, setMirrorLocalCamera] = useLocalStorageBool('vmix_local_camera_mirror', true)

  useEffect(() => {
    if (!streamerMode) setStudioOpen(false)
  }, [streamerMode])

  const blockImmersiveChromeHide = useMemo(
    () =>
      leaveDialog !== null ||
      vmixModalOpen ||
      screenStopDialogOpen ||
      vmixStopDialogOpen ||
      studioOpen ||
      (chatOpen && !chatEmbed),
    [
      leaveDialog,
      vmixModalOpen,
      screenStopDialogOpen,
      vmixStopDialogOpen,
      studioOpen,
      chatOpen,
      chatEmbed,
    ],
  )

  useEffect(() => {
    if (!immersiveAutoHide) {
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
      setChromeHidden(false)
      return
    }
    setChromeHidden(false)
    armImmersiveHideTimer()
    const onDocPointer = () => {
      if (!immersiveAutoHideRef.current) return
      if (chromeHiddenRef.current) return
      armImmersiveHideTimer()
    }
    document.addEventListener('pointerdown', onDocPointer, true)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer, true)
      if (hideTimerRef.current != null) {
        window.clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [immersiveAutoHide, armImmersiveHideTimer])

  useEffect(() => {
    if (!immersiveAutoHide || !blockImmersiveChromeHide) return
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setChromeHidden(false)
  }, [blockImmersiveChromeHide, immersiveAutoHide])

  const remoteList = useMemo(() => [...participants.values()], [participants])
  const chatAvatarByPeerId = useMemo(() => {
    const map: Record<string, string | null | undefined> = {}
    if (localPeerId) map[localPeerId] = avatarUrl ?? null
    participants.forEach((participant, peerId) => {
      map[peerId] = participant.avatarUrl ?? null
    })
    return map
  }, [participants, localPeerId, avatarUrl])
  const chatAvatarByUserId = useMemo(() => {
    const map: Record<string, string | null | undefined> = {}
    if (user?.id) map[user.id] = avatarUrl ?? null
    return map
  }, [user?.id, avatarUrl])
  const chatKnownUserIds = useMemo(
    () =>
      Array.from(
        new Set(
          chatMessages
            .map((m) => m.senderUserId?.trim() ?? '')
            .filter((id) => id && id !== (user?.id ?? '')),
        ),
      ),
    [chatMessages, user?.id],
  )

  useEffect(() => {
    let cancelled = false
    if (!user?.id || chatKnownUserIds.length === 0) {
      setChatContactStatuses({})
      return
    }
    void getContactStatuses(chatKnownUserIds).then((result) => {
      if (cancelled) return
      if (result.data) setChatContactStatuses(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [chatKnownUserIds, user?.id])

  const toggleFavoriteFromChat = useCallback(async (targetUserId: string, nextFavorite: boolean) => {
    const current = chatContactStatuses[targetUserId]
    setChatContactStatuses((prev) => ({
      ...prev,
      [targetUserId]: {
        targetUserId,
        isFavorite: nextFavorite,
        favorsMe: current?.favorsMe ?? false,
        isFriend: nextFavorite && (current?.favorsMe ?? false),
      },
    }))
    const result = await setUserFavorite(targetUserId, nextFavorite)
    if (result.error || !result.data) {
      setChatContactStatuses((prev) => {
        const next = { ...prev }
        if (current) next[targetUserId] = current
        else delete next[targetUserId]
        return next
      })
      return
    }
    setChatContactStatuses((prev) => ({
      ...prev,
      [targetUserId]: result.data!,
    }))
  }, [chatContactStatuses])

  const openDirectChat = useCallback((targetUserId: string, targetName?: string | null) => {
    const sp = new URLSearchParams()
    sp.set('with', targetUserId)
    if (targetName?.trim()) sp.set('title', targetName.trim())
    window.open(`/dashboard/messenger?${sp.toString()}`, '_blank', 'noopener')
  }, [])

  /** Участники-люди в счётчике шапки (без виртуального vMix/SRT). */
  const remoteHumanPeers = useMemo(
    () => remoteList.filter((p) => p.name !== 'vMix' && p.virtualSourceType !== 'studio_program'),
    [remoteList],
  )

  const inviteExcludeUserIds = useMemo(() => {
    const ids: string[] = []
    if (user?.id) ids.push(user.id)
    for (const p of remoteHumanPeers) {
      if (p.authUserId) ids.push(p.authUserId)
    }
    return ids
  }, [user?.id, remoteHumanPeers])

  const handleFriendsInviteSent = useCallback((ok: number, fail: number) => {
    if (friendsInviteToastTimerRef.current != null) window.clearTimeout(friendsInviteToastTimerRef.current)
    let msg: string
    if (fail === 0) {
      msg =
        ok === 1
          ? 'Ссылка на комнату отправлена одному человеку в личный чат.'
          : `Ссылка на комнату отправлена ${ok} людям в личный чат.`
    } else if (ok === 0) {
      msg = `Не удалось отправить приглашения (${fail}).`
    } else {
      msg = `Отправлено: ${ok}, с ошибками: ${fail}.`
    }
    setFriendsInviteToast(msg)
    friendsInviteToastTimerRef.current = window.setTimeout(() => {
      setFriendsInviteToast(null)
      friendsInviteToastTimerRef.current = null
    }, 5200)
  }, [])

  const vmixPeer = useMemo(
    () => remoteList.find((p) => p.name === 'vMix'),
    [remoteList],
  )

  /** У гостя нет vmixIngressInfo, но участник vMix в комнате есть — фаза по peer, не только по ack старта. */
  const vmixPhase: VmixIngressPhase = useMemo(() => {
    if (!vmixIngressInfo && !vmixPeer) return 'idle'
    if (vmixPeer?.videoStream) return 'live'
    return 'waiting'
  }, [vmixIngressInfo, vmixPeer])

  const activeSpeakerPeerId = useActiveSpeaker(
    layout === 'speaker',
    localPeerId,
    localStream,
    isMuted,
    remoteList,
  )

  const remoteScreenActive = useMemo(
    () => remoteList.some((p) => p.screenStream),
    [remoteList],
  )
  const remoteStudioProgramActive = useMemo(
    () => remoteList.some((p) => p.studioProgramStream || (p.virtualSourceType === 'studio_program' && p.videoStream)),
    [remoteList],
  )
  const canStartScreenShare = !remoteScreenActive && !remoteScreenSharePending

  const hasAnyScreenShare =
    isScreenSharing ||
    remoteScreenActive ||
    remoteScreenSharePending ||
    remoteStudioProgramActive ||
    remoteStudioProgramConsumePending
  const hadScreenShareRef = useRef(false)
  useEffect(() => {
    if (hasAnyScreenShare && !hadScreenShareRef.current) {
      setLayout('speaker')
    }
    hadScreenShareRef.current = hasAnyScreenShare
  }, [hasAnyScreenShare])

  const viewportMobilePrevRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (viewportMobilePrevRef.current === null) {
      viewportMobilePrevRef.current = isViewportMobile
      return
    }
    if (viewportMobilePrevRef.current === isViewportMobile) return
    viewportMobilePrevRef.current = isViewportMobile
    if (hasAnyScreenShare) return
    const stored = readStoredLayoutMode(isViewportMobile) ?? getDefaultLayoutMode()
    setLayout(stored)
    const pip = readStoredPipLayout(isViewportMobile)
    setPipPos(pip.pos)
    setPipSize(pip.size)
  }, [isViewportMobile, hasAnyScreenShare])

  const localScreenTileId = useMemo(() => {
    if (!isScreenSharing || !localScreenStream) return null
    return localScreenPeerId ?? localScreenTileKey(localPeerId)
  }, [isScreenSharing, localScreenStream, localScreenPeerId, localPeerId])

  const remoteScreenTileCount = useMemo(
    () => remoteList.filter((p) => p.screenStream).length,
    [remoteList],
  )
  const remoteStudioProgramTileCount = useMemo(
    () => remoteList.filter((p) => p.studioProgramStream || (p.virtualSourceType === 'studio_program' && p.videoStream)).length,
    [remoteList],
  )
  /** Только люди: вы + удалённые гости; без vMix/SRT и без плиток демонстрации экрана. */
  const rosterCount = remoteHumanPeers.length + 1

  const mobileSoloTiles =
    isViewportMobile &&
    layoutUsesTiledView(layout) &&
    remoteHumanPeers.length === 0 &&
    !(isScreenSharing && localScreenStream) &&
    remoteScreenTileCount === 0 &&
    remoteStudioProgramTileCount === 0

  const mobileMultiTiles = isViewportMobile && layoutUsesTiledView(layout) && !mobileSoloTiles

  const {
    cameras, microphones,
    selectedCameraId, selectedMicId,
    setSelectedCameraId, setSelectedMicId,
    enumerate,
  } = useDevices()

  useEffect(() => { if (localStream) enumerate() }, [localStream, enumerate])


  useEffect(() => {
    void refreshAudioOutputs()
  }, [localStream, refreshAudioOutputs])

  useEffect(() => {
    if (!chatOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setChatOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chatOpen])

  const orderedTileIds = useMemo(() => {
    const ids: string[] = [localPeerId]
    if (localScreenTileId) ids.push(localScreenTileId)
    for (const p of remoteList) {
      if (p.virtualSourceType === 'studio_program' && !p.videoStream) continue
      ids.push(p.peerId)
      const sid = remoteScreenTileId(p)
      if (sid) ids.push(sid)
      const stu = remoteStudioProgramTileId(p)
      if (stu) ids.push(stu)
    }
    return ids
  }, [localPeerId, localScreenTileId, remoteList])

  const mobileStackedTiles =
    isViewportMobile &&
    layout === 'grid' &&
    !mobileSoloTiles &&
    orderedTileIds.length === 2

  const orderedTileIdsRef = useRef(orderedTileIds)
  orderedTileIdsRef.current = orderedTileIds

  const allTileIdsSet = useMemo(() => new Set(orderedTileIds), [orderedTileIds])

  const stageLayout = layout === 'speaker'
  const [pinnedSpeakerTileId, setPinnedSpeakerTileId] = useState<string | null>(null)

  useEffect(() => {
    setPinnedSpeakerTileId((prev) => (prev && allTileIdsSet.has(prev) ? prev : null))
  }, [allTileIdsSet])

  const togglePinnedSpeakerTile = useCallback((tileId: string) => {
    setPinnedSpeakerTileId((prev) => (prev === tileId ? null : tileId))
  }, [])

  const speakerFallbackTileId = useMemo(() => {
    if (orderedTileIds.length === 0) return localPeerId
    const presentationTileId = orderedTileIds.find((id) => isScreenTileId(id) || isStudioProgramTileId(id))
    if (presentationTileId) return presentationTileId
    if (allTileIdsSet.has(activeSpeakerPeerId) && !isScreenTileId(activeSpeakerPeerId)) {
      return activeSpeakerPeerId
    }
    return remoteList[0]?.peerId ?? localPeerId
  }, [orderedTileIds, localPeerId, allTileIdsSet, activeSpeakerPeerId, remoteList])

  const speakerFeaturedPeerId =
    pinnedSpeakerTileId && allTileIdsSet.has(pinnedSpeakerTileId)
      ? pinnedSpeakerTileId
      : speakerFallbackTileId

  const featuredPeerId = layout === 'speaker' ? speakerFeaturedPeerId : null

  useEffect(() => {
    if (!isScreenSharing) setScreenStopDialogOpen(false)
  }, [isScreenSharing])

  useEffect(() => {
    if (!localStream) { setSourceAspect(null); return }
    const track = localStream.getVideoTracks()[0]
    if (!track) { setSourceAspect(null); return }
    const s = track.getSettings()
    if (s.width && s.height) setSourceAspect(s.width / s.height)
  }, [localStream])

  const cameraTileVideoStyle: React.CSSProperties = useMemo(
    () => ({
      width: '100%',
      height: '100%',
      objectFit: (hideVideoLetterboxing ? 'cover' : 'contain') as React.CSSProperties['objectFit'],
      objectPosition: 'center',
    }),
    [hideVideoLetterboxing],
  )

  const screenShareVideoStyle: React.CSSProperties = useMemo(
    () => ({
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      objectPosition: 'center',
    }),
    [],
  )

  const localCameraTileVideoStyle: React.CSSProperties = useMemo(
    () => ({
      width: '100%',
      height: '100%',
      objectFit: (hideVideoLetterboxing ? 'cover' : 'contain') as React.CSSProperties['objectFit'],
      objectPosition: 'center',
      display: 'block',
    }),
    [hideVideoLetterboxing],
  )

  const gridStyle = (cols: number): React.CSSProperties => ({
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
  })

  const localSrt = srtByPeer[localPeerId]

  const localTile = (inPip: boolean) => (
    <LocalTile
      stream={localStream}
      name={name}
      isMuted={isMuted}
      isCamOff={isCamOff}
      avatarUrl={user?.user_metadata?.avatar_url as string | undefined}
      videoStyle={localCameraTileVideoStyle}
      showInfo={showInfo}
      showMeter={showMeter}
      roomId={roomId}
      peerId={localPeerId}
      inPip={inPip}
      srtConnectUrl={localSrt?.connectUrlPublic}
      srtListenPort={localSrt?.listenPort}
      reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
      mirrorLocalPreview={mirrorLocalCamera}
      showSoloViewerCopy={canUseElevatedRoomTools}
    />
  )

  const leaveMessage =
    leaveEndsRoomForAll
      ? leaveDialog && leaveDialog.others > 0
        ? `В комнате ещё ${leaveDialog.others} ${ruParticipantsWord(leaveDialog.others)}. Звонок завершится для всех участников.`
        : 'Звонок будет завершён для всех участников.'
      : leaveDialog && leaveDialog.others > 0
        ? `В комнате ещё ${leaveDialog.others} ${ruParticipantsWord(leaveDialog.others)}. Для них звонок продолжится.`
        : 'Вы отключитесь от комнаты.'

  const openLeaveDialog = (mode: 'home' | 'leave', others: number) => {
    setLeaveDialog({ mode, others })
  }

  const closeLeaveDialog = () => setLeaveDialog(null)

  const confirmLeave = () => {
    closeLeaveDialog()
    onLeave()
  }

  const onLogoHomeClick = () => {
    if (remoteHumanPeers.length === 0) onLeave()
    else openLeaveDialog('home', remoteHumanPeers.length)
  }

  const requestStopScreenSharing = () => {
    if (isScreenSharing) setScreenStopDialogOpen(true)
  }

  const closeScreenStopDialog = () => setScreenStopDialogOpen(false)

  const confirmStopScreenSharing = () => {
    closeScreenStopDialog()
    onToggleScreenShare()
  }

  const handleStartVmixIngress = useCallback(async () => {
    setVmixError(null)
    try {
      const res = await onStartVmixIngress()
      if (res.ok) {
        setVmixModalMode('setup')
        setVmixModalOpen(true)
      } else {
        setVmixError(res.error)
      }
    } catch (e) {
      setVmixError(e instanceof Error ? e.message : String(e))
    }
  }, [onStartVmixIngress])

  const handleStopVmixIngress = useCallback(async () => {
    setVmixError(null)
    try {
      const res = await onStopVmixIngress()
      if (!res.ok && res.error) {
        setVmixError(res.error)
      }
    } catch (e) {
      setVmixError(e instanceof Error ? e.message : String(e))
    }
  }, [onStopVmixIngress])

  const requestStopVmixIngress = useCallback(() => {
    if (vmixIngressInfo) setVmixStopDialogOpen(true)
  }, [vmixIngressInfo])

  const closeVmixStopDialog = useCallback(() => setVmixStopDialogOpen(false), [])

  const confirmStopVmixIngress = useCallback(async () => {
    closeVmixStopDialog()
    await handleStopVmixIngress()
  }, [closeVmixStopDialog, handleStopVmixIngress])

  const openVmixSettingsReference = useCallback(() => {
    setVmixModalMode('reference')
    setVmixModalOpen(true)
  }, [])

  const vmixPlayoutGain = vmixProgramMuted ? 0 : vmixProgramVolume

  const cardPlayout = useMemo(() => ({
    playoutVolume,
    playoutSinkId,
  }), [playoutVolume, playoutSinkId])

  const [pipFloatTileId, setPipFloatTileId] = useState(localPeerId)

  useEffect(() => {
    if (layout !== 'pip') setPipFloatTileId(localPeerId)
  }, [layout, localPeerId])

  useEffect(() => {
    if (layout !== 'pip' || isViewportMobile) return
    setPipFloatTileId(localPeerId)
  }, [layout, isViewportMobile, localPeerId])

  const orderedIdsKey = useMemo(() => orderedTileIds.join('\0'), [orderedTileIds])
  useEffect(() => {
    const ids = orderedTileIdsRef.current
    setPipFloatTileId((cur) => (ids.includes(cur) ? cur : localPeerId))
  }, [orderedIdsKey, localPeerId])

  const pipGridTileIds = useMemo(
    () => orderedTileIds.filter((id) => id !== pipFloatTileId),
    [orderedTileIds, pipFloatTileId],
  )

  const remoteGuestCount = remoteHumanPeers.length

  const swapPipGridTileToFloat = useCallback(
    (tileId: string) => {
      if (remoteGuestCount <= 1) return
      if (tileId === pipFloatTileId) return
      setPipFloatTileId(tileId)
    },
    [remoteGuestCount, pipFloatTileId],
  )

  const onPipFloatDoubleTap = useCallback(() => {
    if (pipFloatTileId === localPeerId) {
      const firstAfterLocal = orderedTileIds.slice(1)[0]
      if (firstAfterLocal) setPipFloatTileId(firstAfterLocal)
    } else {
      setPipFloatTileId(localPeerId)
    }
  }, [pipFloatTileId, localPeerId, orderedTileIds])

  const resetView = useCallback(() => {
    setLayout(isViewportMobile ? 'grid' : 'pip')
    setPipFloatTileId(localPeerId)
    setPipPos ({ x: 16,  y: 10  })
    setPipSize(isViewportMobile ? { w: 140, h: 94 } : { w: 220, h: 148 })
  }, [isViewportMobile, localPeerId])

  const galleryGridCols = mobileSoloTiles || mobileStackedTiles ? 1 : 2
  const galleryPlaceholderCount = gridTrailingPlaceholders(orderedTileIds.length, galleryGridCols)

  const pipGridCols = gridCols(Math.max(1, pipGridTileIds.length))
  const pipPlaceholderCount =
    pipGridTileIds.length > 0 ? gridTrailingPlaceholders(pipGridTileIds.length, pipGridCols) : 0

  const renderConferenceTile = (id: string) => {
    if (id === localPeerId) {
      return localTile(false)
    }
    if (localScreenTileId && id === localScreenTileId && localScreenStream) {
      return (
        <LocalScreenShareTile
          stream={localScreenStream}
          label={`${name} — экран`}
          roomId={roomId}
          linkPeerId={localScreenPeerId ?? undefined}
          videoStyle={screenShareVideoStyle}
          showInfo={showInfo}
          srtConnectUrl={localSrt?.connectUrlPublic}
          srtListenPort={localSrt?.listenPort}
          onStopShare={requestStopScreenSharing}
          reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
          showSoloViewerCopy={canUseElevatedRoomTools}
          guestMute={
            canUseElevatedRoomTools && requestPeerMicMute
              ? { show: true, onMute: () => requestPeerMicMute(localPeerId) }
              : undefined
          }
        />
      )
    }
    const remotePresenter = remoteList.find((p) => remoteScreenTileId(p) === id)
    if (remotePresenter?.screenStream) {
      return (
        <LocalScreenShareTile
          stream={remotePresenter.screenStream}
          label={`${remotePresenter.name} — экран`}
          roomId={roomId}
          linkPeerId={remotePresenter.screenPeerId ?? undefined}
          videoStyle={screenShareVideoStyle}
          showInfo={showInfo}
          srtConnectUrl={srtByPeer[remotePresenter.peerId]?.connectUrlPublic}
          srtListenPort={srtByPeer[remotePresenter.peerId]?.listenPort}
          reactionBurst={pickLatestBurstForPeer(reactionBursts, remotePresenter.peerId)}
          showSoloViewerCopy={canUseElevatedRoomTools}
          guestMute={
            canUseElevatedRoomTools && requestPeerMicMute
              ? { show: true, onMute: () => requestPeerMicMute(remotePresenter.peerId) }
              : undefined
          }
        />
      )
    }
    if (isScreenTileId(id)) {
      const owner = parseScreenTilePeerId(id)
      if (!owner) return null
      if (owner === localPeerId) {
        if (!localScreenStream) return null
        return (
          <LocalScreenShareTile
            stream={localScreenStream}
            label={`${name} — экран`}
            roomId={roomId}
            linkPeerId={localScreenPeerId ?? undefined}
            videoStyle={screenShareVideoStyle}
            showInfo={showInfo}
            srtConnectUrl={localSrt?.connectUrlPublic}
            srtListenPort={localSrt?.listenPort}
            onStopShare={requestStopScreenSharing}
            reactionBurst={pickLatestBurstForPeer(reactionBursts, localPeerId)}
            showSoloViewerCopy={canUseElevatedRoomTools}
            guestMute={
              canUseElevatedRoomTools && requestPeerMicMute
                ? { show: true, onMute: () => requestPeerMicMute(localPeerId) }
                : undefined
            }
          />
        )
      }
      const p = participants.get(owner)
      if (!p?.screenStream) return null
      return (
        <LocalScreenShareTile
          stream={p.screenStream}
          label={`${p.name} — экран`}
          roomId={roomId}
          linkPeerId={p.screenPeerId ?? undefined}
          videoStyle={screenShareVideoStyle}
          showInfo={showInfo}
          srtConnectUrl={srtByPeer[p.peerId]?.connectUrlPublic}
          srtListenPort={srtByPeer[p.peerId]?.listenPort}
          reactionBurst={pickLatestBurstForPeer(reactionBursts, owner)}
          showSoloViewerCopy={canUseElevatedRoomTools}
          guestMute={
            canUseElevatedRoomTools && requestPeerMicMute
              ? { show: true, onMute: () => requestPeerMicMute(owner) }
              : undefined
          }
        />
      )
    }
    const p = participants.get(id)
    if (!p) return null
    if (p.virtualSourceType === 'studio_program' && p.videoStream) {
      const owner = p.sourceOwnerPeerId ?? p.peerId
      const linkPeerId = p.studioProgramPeerId ?? owner
      const phase =
        remoteStudioRtmpByPeer[owner] ??
        (remoteStudioProgramConsumePending ? 'connecting' : 'idle')
      return (
        <StudioProgramShareTile
          stream={p.videoStream}
          label="ЭФИР"
          roomId={roomId}
          linkPeerId={linkPeerId}
          videoStyle={screenShareVideoStyle}
          showInfo={showInfo}
          srtConnectUrl={srtByPeer[owner]?.connectUrlPublic}
          srtListenPort={srtByPeer[owner]?.listenPort}
          reactionBurst={pickLatestBurstForPeer(reactionBursts, owner)}
          showSoloViewerCopy={canUseElevatedRoomTools}
          rtmpPhase={phase}
          guestMute={
            canUseElevatedRoomTools && requestPeerMicMute
              ? { show: true, onMute: () => requestPeerMicMute(owner) }
              : undefined
          }
        />
      )
    }
    const isVmixTile = p.name === 'vMix'
    return (
      <ParticipantCard
        participant={p}
        videoStyle={cameraTileVideoStyle}
        showInfo={showInfo}
        showMeter={showMeter}
        roomId={roomId}
        srtConnectUrl={srtByPeer[id]?.connectUrlPublic}
        srtListenPort={srtByPeer[id]?.listenPort}
        badge={isVmixTile ? 'Программа' : null}
        playoutVolume={isVmixTile ? playoutVolume * vmixPlayoutGain : cardPlayout.playoutVolume}
        playoutSinkId={cardPlayout.playoutSinkId}
        reactionBurst={pickLatestBurstForPeer(reactionBursts, p.peerId)}
        getPeerUplinkVideoQuality={getPeerUplinkVideoQuality}
        showSoloViewerCopy={canUseElevatedRoomTools}
        guestMute={
          !isVmixTile && canUseElevatedRoomTools && requestPeerMicMute
            ? { show: true, onMute: () => requestPeerMicMute(p.peerId) }
            : undefined
        }
        guestKick={
          !isVmixTile && isDbSpaceRoomHost && p.authUserId && p.authUserId !== user?.id
            ? {
                show: true,
                onKick: () => requestKickPeer?.(p.peerId),
                onBan: () => void handleBanPeer(p.peerId, p.authUserId!),
              }
            : undefined
        }
        onOpenDirectChat={
          p.authUserId && user?.id && p.authUserId !== user.id
            ? (participant) => openDirectChat(participant.authUserId!, participant.name)
            : undefined
        }
      />
    )
  }

  const pipFloatSrtCopy = useMemo(() => {
    const id = pipFloatTileId
    const base = { roomId }
    const core =
      id === localPeerId
        ? {
            ...base,
            connectUrl: localSrt?.connectUrlPublic,
            listenPort: localSrt?.listenPort,
            peerId: localPeerId,
          }
        : localScreenTileId && id === localScreenTileId
          ? {
              ...base,
              connectUrl: localSrt?.connectUrlPublic,
              listenPort: localSrt?.listenPort,
              peerId: localScreenPeerId ?? localPeerId,
            }
          : (() => {
              const remotePresenter = remoteList.find((p) => remoteScreenTileId(p) === id)
              if (remotePresenter) {
                const s = srtByPeer[remotePresenter.peerId]
                return {
                  ...base,
                  connectUrl: s?.connectUrlPublic,
                  listenPort: s?.listenPort,
                  peerId: remotePresenter.peerId,
                }
              }
              if (isScreenTileId(id)) {
                const owner = parseScreenTilePeerId(id)
                if (owner === localPeerId) {
                  return {
                    ...base,
                    connectUrl: localSrt?.connectUrlPublic,
                    listenPort: localSrt?.listenPort,
                    peerId: localPeerId,
                  }
                }
                if (owner) {
                  const s = srtByPeer[owner]
                  return {
                    ...base,
                    connectUrl: s?.connectUrlPublic,
                    listenPort: s?.listenPort,
                    peerId: owner,
                  }
                }
              }
              const s = srtByPeer[id]
              return {
                ...base,
                connectUrl: s?.connectUrlPublic,
                listenPort: s?.listenPort,
                peerId: id,
              }
            })()
    const muteTarget = guestMuteTargetPeerId(id, localPeerId)
    const pipGuestMute =
      muteTarget &&
      canUseElevatedRoomTools &&
      requestPeerMicMute &&
      participants.get(muteTarget)?.name !== 'vMix'
        ? { show: true as const, onMute: () => requestPeerMicMute(muteTarget) }
        : undefined
    return { ...core, showSoloViewerCopy: canUseElevatedRoomTools, guestMute: pipGuestMute }
  }, [
    pipFloatTileId,
    localPeerId,
    roomId,
    localSrt,
    localScreenTileId,
    localScreenPeerId,
    remoteList,
    srtByPeer,
    participants,
    canUseElevatedRoomTools,
    requestPeerMicMute,
  ])

  const pipGridDoubleTapEnabled = isViewportMobile && remoteGuestCount > 1

  return (
    <div
      className={`room-page${streamerMode ? ' room-page--streamer-mode' : ''}${
        immersiveAutoHide && chromeHidden ? ' room-page--chrome-hidden' : ''
      }${isViewportMobile ? ' room-page--viewport-mobile' : ''}${
        chatOpen && canSeeRoomChat ? ' room-page--chat-open' : ''
      }${leaveDialog !== null ? ' room-page--leave-dialog' : ''}`}
    >
      <ConfirmDialog
        open={leaveDialog !== null}
        title={
          leaveEndsRoomForAll
            ? leaveDialog?.mode === 'home'
              ? 'Завершить звонок и выйти на главную?'
              : 'Завершить звонок для всех?'
            : leaveDialog?.mode === 'home'
              ? 'Выйти на главную?'
              : 'Покинуть комнату?'
        }
        message={leaveMessage}
        cancelLabel="Отмена"
        confirmLabel={
          leaveEndsRoomForAll
            ? 'Завершить для всех'
            : leaveDialog?.mode === 'home'
              ? 'На главную'
              : 'Выйти'
        }
        onCancel={closeLeaveDialog}
        onConfirm={confirmLeave}
      />

      <VmixIngressModal
        open={vmixModalOpen}
        info={vmixIngressInfo}
        mode={vmixModalMode}
        onClose={() => setVmixModalOpen(false)}
      />

      {user ? (
        <RoomInviteFriendsModal
          open={inviteFriendsModalOpen}
          onClose={() => setInviteFriendsModalOpen(false)}
          roomInviteUrl={buildRoomInviteAbsoluteUrl(roomId)}
          roomId={roomId}
          excludeUserIds={inviteExcludeUserIds}
          onSent={handleFriendsInviteSent}
        />
      ) : null}

      {mobileInviteSheetOpen ? (
        <>
          <button
            type="button"
            className="room-mobile-invite-sheet-backdrop"
            aria-label="Закрыть"
            onClick={() => setMobileInviteSheetOpen(false)}
          />
          <div
            className="room-mobile-invite-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-mobile-invite-sheet-title"
          >
            <h2 id="room-mobile-invite-sheet-title" className="room-mobile-invite-sheet__title">
              Пригласить
            </h2>
            <button
              type="button"
              className="room-invite-dropdown__item"
              onClick={() => {
                handleCopyInviteUrl()
              }}
            >
              Скопировать ссылку
            </button>
            <button
              type="button"
              className="room-invite-dropdown__item"
              onClick={() => {
                handleCopyInviteId()
              }}
            >
              Скопировать ID комнаты
            </button>
            {user ? (
              <button
                type="button"
                className="room-invite-dropdown__item"
                onClick={() => {
                  setMobileInviteSheetOpen(false)
                  setInviteFriendsModalOpen(true)
                }}
              >
                Добавить из контактов
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={vmixStopDialogOpen}
        title="Остановить vMix?"
        message="Программный вход отключится, слушатель SRT закроется. Участники перестанут видеть поток программы."
        cancelLabel="Отмена"
        confirmLabel="Остановить"
        onCancel={closeVmixStopDialog}
        onConfirm={() => { void confirmStopVmixIngress() }}
      />

      <ConfirmDialog
        open={screenStopDialogOpen}
        title="Завершить демонстрацию?"
        message="Участники перестанут видеть ваш экран."
        cancelLabel="Отмена"
        confirmLabel="Завершить"
        onCancel={closeScreenStopDialog}
        onConfirm={confirmStopScreenSharing}
      />

      <div className="room-page__column">
      {/* ── Шапка: только десктоп; на мобильных без исключения не показываем ── */}
      {!isViewportMobile ? (
        <div className="room-page__top-chrome">
          <header className="room-header">
            <button type="button" className="room-logo-btn" onClick={onLogoHomeClick} title="На главную" aria-label="На главную">
              <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
            </button>

            <div className="room-center">
              <div className="room-center__row">
                <div
                  className="room-header-participant-count"
                  title={`${rosterCount} ${ruParticipantsWord(rosterCount)}`}
                  aria-label={`${rosterCount} ${ruParticipantsWord(rosterCount)}`}
                >
                  <ParticipantsBadgeIcon />
                  <span className="room-header-participant-count__num">{rosterCount}</span>
                </div>
                <div className="room-invite-menu" ref={inviteRef}>
                  <button
                    type="button"
                    className={`room-invite-btn${inviteOpen ? ' room-invite-btn--open' : ''}`}
                    onClick={() => setInviteOpen((v) => !v)}
                    title="Пригласить участников"
                  >
                    <InviteIcon />
                  </button>
                  {inviteOpen && (
                    <div className="room-invite-dropdown">
                      <button type="button" className="room-invite-dropdown__item" onClick={handleCopyInviteUrl}>
                        Скопировать ссылку
                      </button>
                      <button type="button" className="room-invite-dropdown__item" onClick={handleCopyInviteId}>
                        Скопировать ID комнаты
                      </button>
                      {user ? (
                        <button
                          type="button"
                          className="room-invite-dropdown__item"
                          onClick={() => {
                            setInviteOpen(false)
                            setInviteFriendsModalOpen(true)
                          }}
                        >
                          Добавить из контактов
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="header-right">
              {canUseElevatedRoomTools ? (
                <div title="Оформление панели для эфира">
                  <PillToggle
                    checked={streamerMode}
                    onCheckedChange={(v) => setStreamerMode(v)}
                    offLabel="Обычный"
                    onLabel="Стример"
                    ariaLabel={streamerMode ? 'Режим стримера включён' : 'Режим стримера выключен'}
                  />
                </div>
              ) : null}
              <ThemeToggle variant="inline" className="theme-toggle--dashboard theme-toggle--room-header" />
              {user && (
                <button
                  type="button"
                  className="room-header-messenger-btn"
                  title="Открыть мессенджер"
                  aria-label="Открыть мессенджер"
                  onClick={() => window.open('/dashboard/messenger', '_blank', 'noopener')}
                >
                  <ChatBubbleIcon />
                  {messengerUnreadCount > 0 ? (
                    <span className="room-header-messenger-btn__badge">
                      {messengerUnreadCount > 99 ? '99+' : messengerUnreadCount}
                    </span>
                  ) : null}
                </button>
              )}
              {user && (
                <div className="header-user-menu" ref={userMenuRef}>
                  <button
                    type="button"
                    className={`header-dashboard-btn${userMenuOpen ? ' header-dashboard-btn--open' : ''}`}
                    title="Меню пользователя"
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    {avatarUrl
                      ? <img src={avatarUrl} alt="" className="header-dashboard-avatar" />
                      : <DashboardIcon />
                    }
                  </button>

                  {userMenuOpen && (
                    <div className="header-user-dropdown">
                      <a
                        href="/dashboard"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="header-user-dropdown__item"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Личный кабинет
                      </a>
                      {isPlatformAdminish && (
                        <a
                          href="/admin"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="header-user-dropdown__item"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          Админка
                        </a>
                      )}
                      <button
                        type="button"
                        className="header-user-dropdown__item"
                        onClick={() => {
                          setUserMenuOpen(false)
                          openLeaveDialog('leave', remoteHumanPeers.length)
                        }}
                      >
                        Выйти из комнаты
                      </button>
                      <div className="header-user-dropdown__separator" />
                      <button
                        type="button"
                        className="header-user-dropdown__item header-user-dropdown__item--danger"
                        onClick={() => { setUserMenuOpen(false); signOut() }}
                      >
                        Выйти из аккаунта
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>
        </div>
      ) : null}

      {isViewportMobile ? (
        <button
          type="button"
          className="room-mobile-fullscreen-btn"
          onClick={() => { void toggleMobilePresentationMode() }}
          title={
            fullscreenSupported
              ? (fullscreenActive ? 'Выйти из полноэкранного режима' : 'Во весь экран')
              : (mobilePresentationActive ? 'Показать панели' : 'Скрыть панели')
          }
          aria-label={
            fullscreenSupported
              ? (fullscreenActive ? 'Выйти из полноэкранного режима' : 'Во весь экран (как F11)')
              : (mobilePresentationActive ? 'Показать панели управления' : 'Скрыть панели управления')
          }
        >
          {mobilePresentationActive ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
        </button>
      ) : null}

      {!isViewportMobile && showLayoutToggle && canUseElevatedRoomTools ? (
        <LayoutCycleFabButton
          className="room-layout-cycle-fab--float"
          onPickNextLayout={() => setLayout((l) => nextLayoutMode(l))}
        />
      ) : null}

      {vmixError && (
        <div className="room-invite-toast room-invite-toast--visible room-invite-toast--error" role="alert">
          <span className="room-invite-toast__title">vMix ошибка</span>
          <span className="room-invite-toast__text">{vmixError}</span>
          <button type="button" className="room-invite-toast__close" onClick={() => setVmixError(null)}>✕</button>
        </div>
      )}

      {connectionState === 'reconnecting' ? (
        <div className="room-invite-toast room-invite-toast--visible room-invite-toast--warning" role="status" aria-live="polite">
          <span className="room-invite-toast__title">Переподключаем комнату…</span>
          <span className="room-invite-toast__text">
            {reconnectAttempt != null
              ? `Пытаемся восстановить соединение, попытка ${reconnectAttempt}.`
              : 'Пытаемся восстановить соединение после обрыва сети или ухода приложения в фон.'}
          </span>
        </div>
      ) : null}

      <div
        className={`room-invite-toast${inviteToast ? ' room-invite-toast--visible' : ''}`}
        role="status"
        aria-live="polite"
        aria-hidden={!inviteToast}
      >
        <span className="room-invite-toast__title">
          {inviteToast === 'id' ? 'ID скопирован' : 'Ссылка скопирована'}
        </span>
        <span className="room-invite-toast__text">
          {inviteToast === 'id'
            ? `ID комнаты: ${roomId}`
            : 'Отправьте её участникам — по ней можно войти в эту комнату.'}
        </span>
      </div>

      <div
        className={`room-invite-toast room-invite-toast--friends${friendsInviteToast ? ' room-invite-toast--visible' : ''}`}
        role="status"
        aria-live="polite"
        aria-hidden={!friendsInviteToast}
      >
        <span className="room-invite-toast__title">Приглашения</span>
        <span className="room-invite-toast__text">{friendsInviteToast}</span>
        <button
          type="button"
          className="room-invite-toast__close"
          onClick={() => {
            if (friendsInviteToastTimerRef.current != null) window.clearTimeout(friendsInviteToastTimerRef.current)
            friendsInviteToastTimerRef.current = null
            setFriendsInviteToast(null)
          }}
          aria-label="Закрыть"
        >
          ✕
        </button>
      </div>

      <div
        className={`room-chat-preview-toast${chatIncomingPreview ? ' room-chat-preview-toast--visible' : ''}`}
        role="status"
        aria-live="polite"
        aria-hidden={!chatIncomingPreview}
      >
        {chatIncomingPreview ? (
          <>
            <button
              type="button"
              className="room-chat-preview-toast__close"
              onClick={onDismissChatIncomingPreview}
              aria-label="Закрыть уведомление"
            >
              ✕
            </button>
            <span className="room-chat-preview-toast__author">{chatIncomingPreview.author}</span>
            <span className="room-chat-preview-toast__text">{chatIncomingPreview.text}</span>
          </>
        ) : null}
      </div>

      <div
        className={`room-body${chatEmbed && chatOpen ? ' room-body--with-embed-chat' : ''}`}
      >
        <div
          className={`room-main${mobileSoloTiles ? ' room-main--mobile-solo-grid' : ''}${mobileMultiTiles ? ' room-main--mobile-multi-grid' : ''}`}
          onPointerDownCapture={() => {
            if (!immersiveAutoHide || !chromeHidden) return
            showChromeAndArmImmersiveTimer()
          }}
        >
      {/* ── Speaker (сцена + полоса превью) ────────────────────────────── */}
      {stageLayout && featuredPeerId && (
        <>
          <div className="room-speaker-main">
            {renderConferenceTile(featuredPeerId)}
          </div>
          <div className="room-speaker-strip">
            {orderedTileIds.map((id) => (
              <SpeakerStripTile
                key={id}
                tileId={id}
                active={id === speakerFeaturedPeerId}
                pinned={id === pinnedSpeakerTileId}
                onTogglePin={togglePinnedSpeakerTile}
              >
                {renderConferenceTile(id)}
              </SpeakerStripTile>
            ))}
          </div>
        </>
      )}

      {/* ── Grid layout ────────────────────────────────────────────────── */}
      {layout === 'grid' && (
        <div
          className={`tile-grid tile-grid--gallery${mobileSoloTiles ? ' tile-grid--mobile-solo' : ''}${mobileMultiTiles ? ' tile-grid--mobile-multi' : ''}${mobileStackedTiles ? ' tile-grid--mobile-duo-stack' : ''}`}
          style={gridStyle(galleryGridCols)}
        >
          {orderedTileIds.map((id) => (
            <React.Fragment key={id}>{renderConferenceTile(id)}</React.Fragment>
          ))}
          {Array.from({ length: galleryPlaceholderCount }, (_, i) => (
            <GridTilePlaceholder key={`gallery-ph-${i}`} />
          ))}
        </div>
      )}

      {/* ── PiP ─────────────────────────────────────────────────────────── */}
      {layout === 'pip' && (
        <div className="pip-container">
          <div
            className="tile-grid pip-grid"
            style={gridStyle(pipGridCols)}
          >
            {pipGridTileIds.length === 0 ? (
              <div className="pip-waiting" role="status" aria-live="polite">
                <BrandLogoLoader size={56} />
                <span className="pip-waiting__text">Ожидание других участников…</span>
              </div>
            ) : (
              <>
                {pipGridTileIds.map((id) =>
                  pipGridDoubleTapEnabled ? (
                    <PipGridTileShell
                      key={id}
                      tileId={id}
                      enableDoubleTap
                      remoteGuestCount={remoteGuestCount}
                      onSwapTileToFloat={swapPipGridTileToFloat}
                    >
                      {renderConferenceTile(id)}
                    </PipGridTileShell>
                  ) : (
                    <React.Fragment key={id}>{renderConferenceTile(id)}</React.Fragment>
                  ),
                )}
                {Array.from({ length: pipPlaceholderCount }, (_, i) => (
                  <GridTilePlaceholder key={`pip-ph-${i}`} />
                ))}
              </>
            )}
          </div>
          <DraggablePip
            pos={pipPos}   onPosChange={setPipPos}
            size={pipSize} onSizeChange={setPipSize}
            lockAspect={pipFloatTileId === localPeerId ? sourceAspect : null}
            srtCopy={pipFloatSrtCopy}
            enableTouchDoubleTap={isViewportMobile && layout === 'pip'}
            onTouchDoubleTap={onPipFloatDoubleTap}
          >
            {pipFloatTileId === localPeerId ? (
              <div className="pip-preview-shell">
                {localTile(true)}
              </div>
            ) : renderConferenceTile(pipFloatTileId)}
          </DraggablePip>
        </div>
      )}
        </div>

        {chatEmbed && chatOpen && (
          <div className="room-chat-sidebar">
            <RoomChatPanel
              variant="embed"
              open
              onClose={() => setChatOpen(false)}
              messages={chatMessages}
              localPeerId={localPeerId}
              localUserId={user?.id ?? null}
              avatarByPeerId={chatAvatarByPeerId}
              avatarByUserId={chatAvatarByUserId}
              contactStatuses={chatContactStatuses}
              onToggleFavoriteUser={(targetUserId, nextFavorite) => {
                void toggleFavoriteFromChat(targetUserId, nextFavorite)
              }}
              onSend={sendChatGuarded}
              composerLocked={chatComposerLocked}
              composerLockedHint={chatComposerHint}
            />
          </div>
        )}
      </div>

      <ControlsBar
        isMuted={isMuted}
        isCamOff={isCamOff}
        cameras={cameras}
        microphones={microphones}
        selectedCameraId={selectedCameraId}
        selectedMicId={selectedMicId}
        onToggleMute={onToggleMute}
        onToggleCam={onToggleCam}
        onLeaveRequest={() => openLeaveDialog('leave', remoteHumanPeers.length)}
        onSwitchCamera={id => { setSelectedCameraId(id); onSwitchCamera(id) }}
        onSwitchMic={id => { setSelectedMicId(id); onSwitchMic(id) }}
        activePreset={activePreset}
        onChangePreset={onChangePreset}
        layout={layout}
        onLayoutChange={setLayout}
        showMeter={showMeter}
        onToggleMeter={() => setShowMeter(v => !v)}
        showInfo={showInfo}
        onToggleInfo={() => setShowInfo(v => !v)}
        onResetView={resetView}
        isScreenSharing={isScreenSharing}
        canStartScreenShare={canStartScreenShare}
        onToggleScreenShare={requestStopScreenSharing}
        onStartScreenShare={onStartScreenShare}
        playoutVolume={playoutVolume}
        onPlayoutVolumeChange={setPlayoutVolume}
        audioOutputs={audioOutputs}
        playoutSinkId={playoutSinkId}
        onPlayoutSinkChange={setPlayoutSinkId}
        showButtonLabels={showControlButtonLabels}
        onToggleButtonLabels={() => setShowControlButtonLabels((v) => !v)}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen(!chatOpen)}
        chatUnreadCount={chatUnreadCount}
        chatEmbed={chatEmbed}
        onToggleChatEmbed={() => setChatEmbed((v) => !v)}
        chatToastNotifications={chatToastNotifications}
        onToggleChatToastNotifications={onToggleChatToastNotifications}
        onSendReaction={onSendReaction}
        streamerMode={streamerMode}
        onStreamerModeChange={canUseElevatedRoomTools ? setStreamerMode : undefined}
        vmixPhase={vmixPhase}
        vmixIngressLoading={vmixIngressLoading}
        onStartVmixIngress={handleStartVmixIngress}
        onRequestStopVmixIngress={requestStopVmixIngress}
        onOpenVmixSettings={openVmixSettingsReference}
        mirrorLocalCamera={mirrorLocalCamera}
        onToggleMirrorLocalCamera={() => setMirrorLocalCamera((v) => !v)}
        vmixProgramVolume={vmixProgramVolume}
        onVmixProgramVolumeChange={setVmixProgramVolume}
        vmixProgramMuted={vmixProgramMuted}
        onToggleVmixProgramMuted={() => setVmixProgramMuted((v) => !v)}
        forceMobileFabMenu={isViewportMobile}
        viewportMobile={isViewportMobile}
        immersiveAutoHide={immersiveAutoHide}
        onToggleImmersiveAutoHide={() => setImmersiveAutoHide((v) => !v)}
        chromeHidden={immersiveAutoHide && chromeHidden}
        onInviteParticipants={handleCopyInviteUrl}
        onInviteFromContacts={undefined}
        onOpenMobileInviteSheet={
          isViewportMobile ? () => setMobileInviteSheetOpen(true) : undefined
        }
        chatFeatureHidden={!canSeeRoomChat}
        roomChatVisibility={roomChatVisibility}
        onRoomChatVisibilityChange={isDbSpaceRoomHost ? handleRoomChatVisibilityChange : undefined}
        showRoomChatPolicySettings={isDbSpaceRoomHost}
        showAdminPanelLink={isPlatformAdminish}
        hideVideoLetterboxing={hideVideoLetterboxing}
        onHideVideoLetterboxingChange={setHideVideoLetterboxing}
        canManageVmixProgramIngress={canUseElevatedRoomTools}
        showMobileLayoutCycle={showLayoutToggle}
        showStudioEntry={streamerMode && canUseElevatedRoomTools && !isViewportMobile}
        studioOpen={studioOpen}
        onStudioToggle={() => setStudioOpen((v) => !v)}
      />
      </div>

      {chatOpen && !chatEmbed && (
        <RoomChatPanel
          variant="overlay"
          open
          onClose={() => setChatOpen(false)}
          messages={chatMessages}
            localPeerId={localPeerId}
            localUserId={user?.id ?? null}
            avatarByPeerId={chatAvatarByPeerId}
            avatarByUserId={chatAvatarByUserId}
            contactStatuses={chatContactStatuses}
            onToggleFavoriteUser={(targetUserId, nextFavorite) => {
              void toggleFavoriteFromChat(targetUserId, nextFavorite)
            }}
          onSend={sendChatGuarded}
          composerLocked={chatComposerLocked}
          composerLockedHint={chatComposerHint}
        />
      )}

      {studioOpen ? (
        <Suspense fallback={<div className="join-screen"><div className="auth-loading" aria-label="Загрузка…" /></div>}>
          <StudioModeWorkspace
            open={studioOpen}
            onClose={() => setStudioOpen(false)}
            participants={participants}
            localPeerId={localPeerId || null}
            localStream={localStream}
            localScreenStream={localScreenStream}
            localDisplayName={name}
            startStudioPreview={startStudioPreview}
            stopStudioPreview={stopStudioPreview}
            startStudioProgram={startStudioProgram}
            stopStudioProgram={stopStudioProgram}
            replaceStudioProgramAudioTrack={replaceStudioProgramAudioTrack}
            studioBroadcastHealth={studioBroadcastHealth}
            studioBroadcastHealthDetail={studioBroadcastHealthDetail}
            studioServerLogLines={studioServerLogLines}
          />
        </Suspense>
      ) : null}

      {/* Запросы на вход (access_mode=approval) */}
      {isDbSpaceRoomHost && joinRequests.length > 0 ? (
        <div className="room-join-requests">
          <div className="room-join-requests__header">
            Запросы на вход
            <span className="room-join-requests__count">{joinRequests.length}</span>
          </div>
          {joinRequests.map((req) => (
            <div key={req.requestId} className="room-join-requests__item">
              <span className="room-join-requests__name">{req.displayName}</span>
              <div className="room-join-requests__actions">
                <button
                  type="button"
                  className="room-join-requests__approve"
                  onClick={() => void handleApproveJoinRequest(req)}
                  title="Одобрить вход"
                >
                  ✓ Впустить
                </button>
                <button
                  type="button"
                  className="room-join-requests__deny"
                  onClick={() => void handleDenyJoinRequest(req)}
                  title="Отклонить запрос"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Тост: управление перехвачено другим устройством */}
      {hostTransferredToast ? (
        <div className="room-host-transfer-toast" role="status">
          Управление комнатой перенято на другом устройстве
          <button
            type="button"
            className="room-host-transfer-toast__close"
            onClick={() => setHostTransferredToast(false)}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Обёртка ячейки PiP-сетки: двойной тап переносит источник в плавающее превью (если гостей > 1). */
function PipGridTileShell({
  tileId,
  enableDoubleTap,
  remoteGuestCount,
  onSwapTileToFloat,
  children,
}: {
  tileId: string
  enableDoubleTap: boolean
  remoteGuestCount: number
  onSwapTileToFloat: (id: string) => void
  children: React.ReactNode
}) {
  const onDouble = useCallback(() => {
    if (remoteGuestCount > 1) onSwapTileToFloat(tileId)
  }, [remoteGuestCount, onSwapTileToFloat, tileId])
  const touch = useTouchDoubleTap(onDouble, enableDoubleTap)
  return (
    <div className="pip-grid-tile-shell" {...touch}>
      {children}
    </div>
  )
}

// ─── Local tile ───────────────────────────────────────────────────────────────

function LocalTile({
  stream, name, isMuted, isCamOff, videoStyle, showInfo, showMeter,
  roomId, peerId, inPip, srtConnectUrl, srtListenPort,
  reactionBurst,
  mirrorLocalPreview,
  avatarUrl,
  showSoloViewerCopy = true,
}: {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
  avatarUrl?: string | null
  videoStyle: React.CSSProperties
  showInfo?: boolean
  showMeter?: boolean
  roomId: string
  peerId: string
  inPip: boolean
  srtConnectUrl?: string
  srtListenPort?: number
  reactionBurst?: RoomReactionBurst | null
  mirrorLocalPreview?: boolean
  showSoloViewerCopy?: boolean
}) {
  const mainVideoRef = useRef<HTMLVideoElement>(null)

  const mainStream = stream
  const hasLiveCamera =
    Boolean(stream?.getVideoTracks().some((t) => t.kind === 'video' && t.readyState === 'live'))
  const showMainVideo = !isCamOff && hasLiveCamera
  const showAvatar = !showMainVideo

  useEffect(() => {
    if (mainVideoRef.current) mainVideoRef.current.srcObject = mainStream
  }, [mainStream])

  const videoInner = (
    <>
      <video
        ref={mainVideoRef}
        autoPlay
        playsInline
        muted
        className={showMainVideo ? 'participant-card__main-video' : 'participant-card__main-video hidden'}
        style={videoStyle}
      />
      {showAvatar && (
        <div className="cam-off-avatar">
          <ParticipantTileIdle name={name} avatarUrl={avatarUrl} />
        </div>
      )}
      {showMeter && !isMuted && <AudioMeter stream={stream} stereo />}
      {showInfo && (
        <VideoInfoOverlay
          stream={mainStream}
          videoRef={mainVideoRef}
          roomId={roomId}
          peerId={peerId}
          srtConnectUrl={srtConnectUrl}
          showSoloViewerCopy={showSoloViewerCopy}
        />
      )}
    </>
  )

  const barInner = (
    <>
      <span className="card-name">{name} (вы)</span>
      <span className="card-bar-actions">
        {isMuted && <MicOffIcon className="muted-icon" />}
      </span>
    </>
  )

  return (
    <div
      className={`participant-card participant-card--local${
        mirrorLocalPreview ? ' participant-card--local--mirror' : ''
      }`}
    >
      <div className="card-video-wrap">
        {inPip ? (
          <>
            {videoInner}
            {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
          </>
        ) : (
          <SrtCopySurface
            connectUrl={srtConnectUrl}
            listenPort={srtListenPort}
            roomId={roomId}
            tilePeerId={peerId}
            showSoloViewerCopy={showSoloViewerCopy}
          >
            {videoInner}
            {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
          </SrtCopySurface>
        )}
      </div>
      <div className="card-bar">
        {inPip ? (
          <SrtCopySurface
            connectUrl={srtConnectUrl}
            listenPort={srtListenPort}
            roomId={roomId}
            tilePeerId={peerId}
            showSoloViewerCopy={showSoloViewerCopy}
            className="srt-copy-target--bar"
          >
            {barInner}
          </SrtCopySurface>
        ) : (
          barInner
        )}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gridCols(n: number): number {
  if (n <= 1) return 1
  if (n <= 2) return 2
  if (n <= 4) return 2
  if (n <= 6) return 3
  return 3
}

/** Сколько пустых ячеек добавить в последний ряд сетки (cols ≥ 1). */
function gridTrailingPlaceholders(itemCount: number, cols: number): number {
  if (itemCount <= 0 || cols <= 0) return 0
  const r = itemCount % cols
  return r === 0 ? 0 : cols - r
}
