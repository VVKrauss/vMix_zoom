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
    JoinRequestsIcon,
    ParticipantsBadgeIcon,
    ChatBubbleIcon,
    ChevronLeftIcon,
    MenuBurgerIcon,
    FiRrIcon,
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
import { SrtCopySurface, type SrtCopyMenuExtraItem } from './SrtCopyMenu'
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
import { isScreenShareChatNotice } from '../types/roomComms'
import { pickLatestBurstForPeer } from '../types/roomComms'
import { ParticipantTileIdle } from './ParticipantTileIdle'
import { RoomChatPanel } from './RoomChatPanel'
import { RoomManageModal, type RoomManageParticipantRow } from './RoomManageModal'
import { RoomSpaceSettingsPopover } from './RoomSpaceSettingsPopover'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'
import { VmixIngressModal } from './VmixIngressModal'
import { RoomInviteFriendsModal } from './RoomInviteFriendsModal'
import { PillToggle } from './PillToggle'
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
import { useSpaceRoomSettings, type SpaceRoomAccessMode } from '../hooks/useSpaceRoomSettings'
import {
  isSessionHostFor,
  clearHostSessionIfMatches,
  participantCanPostRoomChat,
  participantCanSeeRoomChat,
  updateSpaceRoomChatVisibility,
  approveSpaceRoomJoiner,
  removeSpaceRoomApprovedJoiner,
  banUserFromSpaceRoom,
  updateSpaceRoomAccessMode,
  addSpaceRoomAdminUser,
  removeSpaceRoomAdminUser,
  type SpaceRoomChatVisibility,
} from '../lib/spaceRoom'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { StudioOutputPreset } from '../types/studio'
import { getContactStatuses, setContactPin, type ContactStatus } from '../lib/socialGraph'

/** Входящий запрос на вход в комнату (access_mode=approval). */
interface JoinRequest {
  requestId: string
  userId: string | null
  displayName: string
  receivedAt: number
}

function RoomHeaderChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      className={`room-header-room-space__chev-svg${open ? ' room-header-room-space__chev-svg--open' : ''}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="currentColor"
      aria-hidden
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

const StudioModeWorkspace = lazy(async () => {
  const mod = await import('./studio/StudioModeWorkspace')
  return { default: mod.StudioModeWorkspace }
})

const CouchModeWorkspace = lazy(async () => {
  const mod = await import('./CouchModeWorkspace')
  return { default: mod.CouchModeWorkspace }
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
  const [roomSpaceSettingsOpen, setRoomSpaceSettingsOpen] = useState(false)
  const roomSpaceHeaderRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!roomSpaceSettingsOpen) return
    const handler = (e: MouseEvent) => {
      if (shouldClosePopoverOnOutsidePointer(roomSpaceHeaderRef.current, e.target)) {
        setRoomSpaceSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [roomSpaceSettingsOpen])

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
  /** Ref на Realtime-канал модерации (room-mod:slug) для отправки broadcast без создания дубля */
  const modChannelRef = useRef<RealtimeChannel | null>(null)
  /** Запросы на вход (access_mode=approval) */
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  /** Открыта ли модалка запросов */
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false)
  const [roomManageModalOpen, setRoomManageModalOpen] = useState(false)
  /** Тост о новом запросе на вход */
  const [joinRequestToast, setJoinRequestToast] = useState<string | null>(null)
  const joinRequestToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const roomAccessMode = spaceRoomRow?.accessMode ?? 'link'
  const roomAdminUserIds = useMemo(() => spaceRoomRow?.roomAdminUserIds ?? [], [spaceRoomRow?.roomAdminUserIds])
  const isRoomSpaceAdmin = useMemo(
    () => Boolean(user?.id && roomAdminUserIds.includes(user.id)),
    [user?.id, roomAdminUserIds],
  )
  const canManageRoomSpace = useMemo(
    () => isDbSpaceRoomHost || isPlatformAdminish || isRoomSpaceAdmin,
    [isDbSpaceRoomHost, isPlatformAdminish, isRoomSpaceAdmin],
  )
  const canEditSpaceRoomPolicies = useMemo(
    () =>
      Boolean(
        user?.id &&
          spaceRoomRow &&
          (isDbSpaceRoomHost || isPlatformAdminish || roomAdminUserIds.includes(user.id)),
      ),
    [user?.id, spaceRoomRow, isDbSpaceRoomHost, isPlatformAdminish, roomAdminUserIds],
  )
  const canAssignRoomAdmins = useMemo(
    () => isDbSpaceRoomHost || isPlatformAdminish,
    [isDbSpaceRoomHost, isPlatformAdminish],
  )
  const canModerateParticipants = canManageRoomSpace
  const canRemoteMutePeers = Boolean(
    requestPeerMicMute && (canUseElevatedRoomTools || canModerateParticipants),
  )

  const chatParticipantCtx = useMemo(
    () => ({
      isAuthed: Boolean(user?.id),
      isDbHost: isDbSpaceRoomHost,
      isElevatedStaff: isPlatformAdminish,
      isRoomSpaceAdmin,
    }),
    [user?.id, isDbSpaceRoomHost, isPlatformAdminish, isRoomSpaceAdmin],
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
      if (!user?.id || !canEditSpaceRoomPolicies) return
      const ok = await updateSpaceRoomChatVisibility(roomId.trim(), user.id, v)
      if (!ok) console.warn('room chat policy: update failed')
    },
    [user?.id, canEditSpaceRoomPolicies, roomId],
  )

  const handleRoomAccessModeChange = useCallback(
    async (v: SpaceRoomAccessMode) => {
      if (!user?.id || !canEditSpaceRoomPolicies) return
      const ok = await updateSpaceRoomAccessMode(roomId.trim(), user.id, v)
      if (!ok) console.warn('room access mode: update failed')
    },
    [user?.id, canEditSpaceRoomPolicies, roomId],
  )

  // Supabase Realtime broadcast-канал комнаты: join-requests и host-transfer
  useEffect(() => {
    const slug = roomId.trim()
    if (!slug) return

    const ch = supabase
      .channel(`room-mod:${slug}`, { config: { broadcast: { ack: false } } })
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
          // Показываем тост о новом запросе
          setJoinRequestToast(displayName)
          if (joinRequestToastTimerRef.current) clearTimeout(joinRequestToastTimerRef.current)
          joinRequestToastTimerRef.current = setTimeout(() => setJoinRequestToast(null), 5000)
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

    modChannelRef.current = ch

    return () => {
      modChannelRef.current = null
      void supabase.removeChannel(ch)
      if (hostTransferToastTimerRef.current) clearTimeout(hostTransferToastTimerRef.current)
    }
  }, [roomId, isDbSpaceRoomHost])

  const handleApproveJoinRequest = useCallback(
    async (req: JoinRequest) => {
      const slug = roomId.trim()
      if (!slug || !user?.id) return

      // Используем уже подписанный канал — создание нового дубля ломает Realtime
      const ch = modChannelRef.current
      if (ch) {
        void ch.send({
          type: 'broadcast',
          event: 'join-approved',
          payload: { requestId: req.requestId, userId: req.userId },
        })
      }

      // Для авторизованных — дополнительно пишем в approved_joiners (для fallback и re-entry)
      if (req.userId) {
        void approveSpaceRoomJoiner(slug, user.id, req.userId)
      }

      setJoinRequests((prev) => prev.filter((r) => r.requestId !== req.requestId))
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
      // Уведомляем гостя через уже подписанный канал
      const ch = modChannelRef.current
      if (ch) {
        void ch.send({
          type: 'broadcast',
          event: 'join-request-denied',
          payload: { requestId: req.requestId, userId: req.userId },
        })
      }
      setJoinRequests((prev) => prev.filter((r) => r.requestId !== req.requestId))
    },
    [roomId, user?.id],
  )

  const handleBanPeer = useCallback(
    async (targetPeerId: string, targetAuthUserId: string) => {
      if (!user?.id || !canModerateParticipants) return
      await banUserFromSpaceRoom(roomId.trim(), user.id, targetAuthUserId)
      if (requestKickPeer) requestKickPeer(targetPeerId)
    },
    [roomId, user?.id, canModerateParticipants, requestKickPeer],
  )

  const handleRemoveFromRoom = useCallback(
    async (targetPeerId: string, opts: { alsoBan: boolean; authUserId: string | null }) => {
      if (!canModerateParticipants) return
      if (opts.alsoBan && opts.authUserId) {
        await banUserFromSpaceRoom(roomId.trim(), user?.id ?? '', opts.authUserId)
      }
      requestKickPeer?.(targetPeerId)
    },
    [canModerateParticipants, roomId, user?.id, requestKickPeer],
  )

  const handleAssignRoomAdmin = useCallback(
    async (targetUserId: string) => {
      const ok = await addSpaceRoomAdminUser(roomId.trim(), targetUserId)
      if (!ok) console.warn('add room admin: failed')
    },
    [roomId],
  )

  const handleRemoveRoomAdmin = useCallback(
    async (targetUserId: string) => {
      const ok = await removeSpaceRoomAdminUser(roomId.trim(), targetUserId)
      if (!ok) console.warn('remove room admin: failed')
    },
    [roomId],
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
  const [roomMobileChromeMenuOpen, setRoomMobileChromeMenuOpen] = useState(false)

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

  useEffect(() => {
    if (!roomMobileChromeMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRoomMobileChromeMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [roomMobileChromeMenuOpen])

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
  const [couchOpen, setCouchOpen] = useState(false)
  /** Только локальное превью; отправляемый поток без отражения. */
  const [mirrorLocalCamera, setMirrorLocalCamera] = useLocalStorageBool('vmix_local_camera_mirror', true)

  useEffect(() => {
    if (!streamerMode) setStudioOpen(false)
  }, [streamerMode])

  useEffect(() => {
    if (streamerMode) setCouchOpen(false)
  }, [streamerMode])

  const blockImmersiveChromeHide = useMemo(
    () =>
      leaveDialog !== null ||
      vmixModalOpen ||
      screenStopDialogOpen ||
      vmixStopDialogOpen ||
      studioOpen ||
      couchOpen ||
      roomMobileChromeMenuOpen ||
      (chatOpen && !chatEmbed),
    [
      leaveDialog,
      vmixModalOpen,
      screenStopDialogOpen,
      vmixStopDialogOpen,
      studioOpen,
      couchOpen,
      roomMobileChromeMenuOpen,
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
  const contactStatusQueryIds = useMemo(() => {
    const s = new Set<string>()
    for (const id of chatMessages
      .map((m) => m.senderUserId?.trim() ?? '')
      .filter((id) => id && id !== (user?.id ?? ''))) {
      s.add(id)
    }
    for (const p of remoteList) {
      const id = p.authUserId?.trim()
      if (id && id !== (user?.id ?? '')) s.add(id)
    }
    return [...s]
  }, [chatMessages, remoteList, user?.id])

  useEffect(() => {
    let cancelled = false
    if (!user?.id || contactStatusQueryIds.length === 0) {
      setChatContactStatuses({})
      return
    }
    void getContactStatuses(contactStatusQueryIds).then((result) => {
      if (cancelled) return
      if (result.data) setChatContactStatuses(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [contactStatusQueryIds, user?.id])

  const toggleFavoriteFromChat = useCallback(async (targetUserId: string, nextFavorite: boolean) => {
    const current = chatContactStatuses[targetUserId]
    setChatContactStatuses((prev) => ({
      ...prev,
      [targetUserId]: {
        targetUserId,
        pinnedByMe: nextFavorite,
        pinnedMe: current?.pinnedMe ?? false,
        isMutualContact: nextFavorite && (current?.pinnedMe ?? false),
          blockedByMe: current?.blockedByMe ?? false,
          blockedMe: current?.blockedMe ?? false,
      },
    }))
    const result = await setContactPin(targetUserId, nextFavorite)
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

  const buildTileExtras = useCallback(
    (authUserId: string | null | undefined, displayName: string): SrtCopyMenuExtraItem[] | undefined => {
      const uid = authUserId?.trim()
      if (!uid || !user?.id || uid === user.id) return undefined
      const c = chatContactStatuses[uid]
      return [
        {
          key: 'dm',
          label: 'Личный чат',
          onSelect: () => openDirectChat(uid, displayName),
        },
        {
          key: 'fav',
          label: c?.pinnedByMe ? 'Снять закреп' : 'Закрепить',
          onSelect: () => {
            void toggleFavoriteFromChat(uid, !(c?.pinnedByMe ?? false))
          },
        },
      ]
    },
    [user?.id, chatContactStatuses, openDirectChat, toggleFavoriteFromChat],
  )

  /** Участники-люди в счётчике шапки (без виртуального vMix/SRT). */
  const remoteHumanPeers = useMemo(
    () => remoteList.filter((p) => p.name !== 'vMix' && p.virtualSourceType !== 'studio_program'),
    [remoteList],
  )

  const messageCountByPeerId = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of chatMessages) {
      if (m.kind === 'reaction' || m.kind === 'system') continue
      if (isScreenShareChatNotice(m.text)) continue
      map.set(m.peerId, (map.get(m.peerId) ?? 0) + 1)
    }
    return map
  }, [chatMessages])

  const chatMessagesVisibleCount = useMemo(() => {
    let n = 0
    for (const m of chatMessages) {
      if (m.kind === 'reaction' || m.kind === 'system') continue
      if (isScreenShareChatNotice(m.text)) continue
      n++
    }
    return n
  }, [chatMessages])

  const dbHostUserId = spaceRoomRow?.hostUserId ?? null

  const roomManageRows: RoomManageParticipantRow[] = useMemo(() => {
    const rows: RoomManageParticipantRow[] = []
    if (localPeerId) {
      rows.push({
        peerId: localPeerId,
        name,
        avatarUrl: avatarUrl ?? null,
        authUserId: user?.id ?? null,
        messageCount: messageCountByPeerId.get(localPeerId) ?? 0,
        isLocal: true,
        isDbHost: Boolean(user?.id && dbHostUserId && user.id === dbHostUserId),
        isRoomAdmin: Boolean(user?.id && roomAdminUserIds.includes(user.id)),
      })
    }
    for (const p of remoteHumanPeers) {
      rows.push({
        peerId: p.peerId,
        name: p.name,
        avatarUrl: p.avatarUrl ?? null,
        authUserId: p.authUserId ?? null,
        messageCount: messageCountByPeerId.get(p.peerId) ?? 0,
        isLocal: false,
        isDbHost: Boolean(p.authUserId && dbHostUserId && p.authUserId === dbHostUserId),
        isRoomAdmin: Boolean(p.authUserId && roomAdminUserIds.includes(p.authUserId)),
      })
    }
    return rows
  }, [
    localPeerId,
    name,
    avatarUrl,
    user?.id,
    remoteHumanPeers,
    messageCountByPeerId,
    dbHostUserId,
    roomAdminUserIds,
  ])

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
      peekUserId={user?.id ?? null}
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
            canRemoteMutePeers
              ? { show: true, onMute: () => { requestPeerMicMute?.(localPeerId) } }
              : undefined
          }
        />
      )
    }
    const remotePresenter = remoteList.find((p) => remoteScreenTileId(p) === id)
    if (remotePresenter?.screenStream) {
      const screenShareExtras = buildTileExtras(remotePresenter.authUserId, remotePresenter.name)
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
            canRemoteMutePeers
              ? { show: true, onMute: () => { requestPeerMicMute?.(remotePresenter.peerId) } }
              : undefined
          }
          extraMenuItems={screenShareExtras}
          showTileOverflowButton={Boolean(screenShareExtras?.length)}
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
              canRemoteMutePeers
                ? { show: true, onMute: () => { requestPeerMicMute?.(localPeerId) } }
                : undefined
            }
          />
        )
      }
      const p = participants.get(owner)
      if (!p?.screenStream) return null
      const screenExtrasRemote = buildTileExtras(p.authUserId, p.name)
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
            canRemoteMutePeers
              ? { show: true, onMute: () => { requestPeerMicMute?.(owner) } }
              : undefined
          }
          extraMenuItems={screenExtrasRemote}
          showTileOverflowButton={Boolean(screenExtrasRemote?.length)}
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
      const ownerPart = participants.get(owner)
      const studioExtras = buildTileExtras(
        ownerPart?.authUserId ?? p.authUserId,
        ownerPart?.name ?? p.name,
      )
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
            canRemoteMutePeers
              ? { show: true, onMute: () => { requestPeerMicMute?.(owner) } }
              : undefined
          }
          extraMenuItems={studioExtras}
          showTileOverflowButton={Boolean(studioExtras?.length)}
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
          !isVmixTile && canRemoteMutePeers
            ? { show: true, onMute: () => { requestPeerMicMute?.(p.peerId) } }
            : undefined
        }
        guestKick={
          !isVmixTile && canModerateParticipants && (p.authUserId !== user?.id || !p.authUserId)
            ? {
                show: true,
                onKick: () => requestKickPeer?.(p.peerId),
                ...(p.authUserId
                  ? { onBan: () => void handleBanPeer(p.peerId, p.authUserId!) }
                  : {}),
              }
            : undefined
        }
        currentUserId={user?.id}
        contactStatus={p.authUserId ? chatContactStatuses[p.authUserId] : undefined}
        onOpenDirectChat={
          p.authUserId && user?.id && p.authUserId !== user.id
            ? (participant) => openDirectChat(participant.authUserId!, participant.name)
            : undefined
        }
        onToggleFavorite={
          p.authUserId && user?.id && p.authUserId !== user.id
            ? () => {
                const uid = p.authUserId!
                const cur = chatContactStatuses[uid]
                void toggleFavoriteFromChat(uid, !(cur?.pinnedByMe ?? false))
              }
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
      canRemoteMutePeers &&
      participants.get(muteTarget)?.name !== 'vMix'
        ? { show: true as const, onMute: () => { requestPeerMicMute?.(muteTarget) } }
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
    canRemoteMutePeers,
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
            className="room-mobile-invite-sheet device-popover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-mobile-invite-sheet-title"
          >
            <div id="room-mobile-invite-sheet-title" className="device-popover__title">
              Пригласить
            </div>
            <button
              type="button"
              className="device-popover__item"
              onClick={() => {
                handleCopyInviteUrl()
              }}
            >
              Скопировать ссылку
            </button>
            <button
              type="button"
              className="device-popover__item"
              onClick={() => {
                handleCopyInviteId()
              }}
            >
              Скопировать ID комнаты
            </button>
            {user ? (
              <button
                type="button"
                className="device-popover__item"
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
        title="Остановить SRT?"
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
      {isViewportMobile ? (
        <>
          <div className="room-page__mobile-chrome">
            <header className="room-mobile-chrome-head">
              <button
                type="button"
                className="dashboard-messenger__list-head-btn room-mobile-chrome-head__back"
                onClick={onLogoHomeClick}
                title="Назад из комнаты"
                aria-label="Назад из комнаты"
              >
                <ChevronLeftIcon />
              </button>
              <div className="room-mobile-chrome-head__logo" aria-hidden>
                <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
              </div>
              <div className="room-mobile-chrome-head__actions">
                <button
                  type="button"
                  className={`dashboard-messenger__list-head-btn${roomMobileChromeMenuOpen ? ' dashboard-messenger__list-head-btn--open' : ''}`}
                  onClick={() => setRoomMobileChromeMenuOpen((v) => !v)}
                  aria-expanded={roomMobileChromeMenuOpen}
                  aria-haspopup="true"
                  aria-label={roomMobileChromeMenuOpen ? 'Закрыть меню комнаты' : 'Меню комнаты'}
                  title="Управление комнатой"
                >
                  <MenuBurgerIcon />
                </button>
              </div>
            </header>
          </div>
          <div
            className={`room-mobile-chrome-menu-backdrop${roomMobileChromeMenuOpen ? ' room-mobile-chrome-menu-backdrop--open' : ''}`}
            aria-hidden={!roomMobileChromeMenuOpen}
            onClick={() => setRoomMobileChromeMenuOpen(false)}
            role="presentation"
          />
          <nav
            className={`room-mobile-chrome-menu${roomMobileChromeMenuOpen ? ' room-mobile-chrome-menu--open' : ''}`}
            aria-hidden={!roomMobileChromeMenuOpen}
            aria-label="Управление комнатой"
          >
            <div className="room-mobile-chrome-menu__scroll">
              {canManageRoomSpace ? (
                <div className="room-mobile-chrome-menu__section">
                  <div className="room-mobile-chrome-menu__section-title">Комната</div>
                  <RoomSpaceSettingsPopover
                    embedded
                    showInfo={showInfo}
                    onToggleInfo={() => setShowInfo((v) => !v)}
                    roomChatVisibility={roomChatVisibility}
                    onRoomChatVisibilityChange={(v) => void handleRoomChatVisibilityChange(v)}
                    canEditPolicies={canEditSpaceRoomPolicies}
                    roomAccessMode={roomAccessMode}
                    onRoomAccessModeChange={(v) => void handleRoomAccessModeChange(v)}
                    onClose={() => {}}
                  />
                </div>
              ) : null}
              {canManageRoomSpace ? (
                <button
                  type="button"
                  className="room-mobile-chrome-menu__btn"
                  onClick={() => {
                    setRoomMobileChromeMenuOpen(false)
                    setRoomManageModalOpen(true)
                  }}
                >
                  Управление участниками
                </button>
              ) : null}
              <div className="room-mobile-chrome-menu__row room-mobile-chrome-menu__row--muted" role="status">
                <ParticipantsBadgeIcon />
                <span>
                  {rosterCount} {ruParticipantsWord(rosterCount)}
                </span>
              </div>
              <button
                type="button"
                className="room-mobile-chrome-menu__btn"
                onClick={() => {
                  setRoomMobileChromeMenuOpen(false)
                  handleCopyInviteUrl()
                }}
              >
                Скопировать ссылку-приглашение
              </button>
              <button
                type="button"
                className="room-mobile-chrome-menu__btn"
                onClick={() => {
                  setRoomMobileChromeMenuOpen(false)
                  handleCopyInviteId()
                }}
              >
                Скопировать ID комнаты
              </button>
              {user ? (
                <button
                  type="button"
                  className="room-mobile-chrome-menu__btn"
                  onClick={() => {
                    setRoomMobileChromeMenuOpen(false)
                    setInviteFriendsModalOpen(true)
                  }}
                >
                  Пригласить из контактов
                </button>
              ) : null}
              {isDbSpaceRoomHost ? (
                <button
                  type="button"
                  className="room-mobile-chrome-menu__btn"
                  onClick={() => {
                    setRoomMobileChromeMenuOpen(false)
                    setJoinRequestsOpen(true)
                    setJoinRequestToast(null)
                  }}
                >
                  Запросы на вход
                  {joinRequests.length > 0 ? ` (${joinRequests.length})` : ''}
                </button>
              ) : null}
              {canUseElevatedRoomTools ? (
                <div className="room-mobile-chrome-menu__section room-mobile-chrome-menu__section--pill">
                  <span className="room-mobile-chrome-menu__pill-label">Режим стримера</span>
                  <PillToggle
                    compact
                    checked={streamerMode}
                    onCheckedChange={(v) => setStreamerMode(v)}
                    offLabel="Обычный"
                    onLabel="Стример"
                    ariaLabel={streamerMode ? 'Режим стримера включён' : 'Режим стримера выключен'}
                  />
                </div>
              ) : null}
              {streamerMode && canUseElevatedRoomTools ? (
                <button
                  type="button"
                  className="room-mobile-chrome-menu__btn room-mobile-chrome-menu__btn--accent"
                  onClick={() => {
                    setRoomMobileChromeMenuOpen(false)
                    setStudioOpen(true)
                  }}
                >
                  Режим «Студия»
                </button>
              ) : null}
              {user ? (
                <a
                  href="/dashboard/messenger"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="room-mobile-chrome-menu__btn room-mobile-chrome-menu__link"
                  onClick={() => setRoomMobileChromeMenuOpen(false)}
                >
                  Мессенджер
                  {messengerUnreadCount > 0 ? ` (${messengerUnreadCount > 99 ? '99+' : messengerUnreadCount})` : ''}
                </a>
              ) : null}
              {user ? (
                <a
                  href="/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="room-mobile-chrome-menu__btn room-mobile-chrome-menu__link"
                  onClick={() => setRoomMobileChromeMenuOpen(false)}
                >
                  Личный кабинет
                </a>
              ) : null}
              {isPlatformAdminish ? (
                <a
                  href="/admin"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="room-mobile-chrome-menu__btn room-mobile-chrome-menu__link"
                  onClick={() => setRoomMobileChromeMenuOpen(false)}
                >
                  Админка
                </a>
              ) : null}
              <button
                type="button"
                className="room-mobile-chrome-menu__btn"
                onClick={() => {
                  setRoomMobileChromeMenuOpen(false)
                  openLeaveDialog('leave', remoteHumanPeers.length)
                }}
              >
                Выйти из комнаты
              </button>
              {user ? (
                <button
                  type="button"
                  className="room-mobile-chrome-menu__btn room-mobile-chrome-menu__btn--danger"
                  onClick={() => {
                    setRoomMobileChromeMenuOpen(false)
                    void signOut()
                  }}
                >
                  Выйти из аккаунта
                </button>
              ) : null}
            </div>
          </nav>
        </>
      ) : null}
      {/* ── Шапка: десктоп ── */}
      {!isViewportMobile ? (
        <div className="room-page__top-chrome">
          <header className="room-header">
            <div className="room-header__brand">
              <button
                type="button"
                className="dashboard-messenger__list-head-btn room-header-back-btn"
                onClick={onLogoHomeClick}
                title="Назад из комнаты"
                aria-label="Назад из комнаты"
              >
                <ChevronLeftIcon />
              </button>
              <div className="room-header-logo-static" aria-hidden>
                <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
              </div>
            </div>

            <div className="room-center">
              <div className="room-center__row">
                {canManageRoomSpace ? (
                  <div className="room-header-room-space" ref={roomSpaceHeaderRef}>
                    <div className="room-header-room-space__pair">
                      <button
                        type="button"
                        className={`room-header-room-space__main${roomSpaceSettingsOpen ? ' room-header-room-space__main--open' : ''}`}
                        onClick={() => setRoomSpaceSettingsOpen((v) => !v)}
                        title="Настройки комнаты"
                        aria-expanded={roomSpaceSettingsOpen}
                        aria-haspopup="dialog"
                      >
                        <FiRrIcon name="settings-sliders" className="room-header-room-space__fi" />
                      </button>
                      <button
                        type="button"
                        className={`room-header-room-space__chev${roomSpaceSettingsOpen ? ' room-header-room-space__chev--open' : ''}`}
                        onClick={() => setRoomSpaceSettingsOpen((v) => !v)}
                        title="Настройки комнаты"
                        aria-label="Открыть настройки комнаты"
                      >
                        <RoomHeaderChevronGlyph open={roomSpaceSettingsOpen} />
                      </button>
                    </div>
                    {roomSpaceSettingsOpen ? (
                      <div className="room-header-room-space__dropdown">
                        <RoomSpaceSettingsPopover
                          embedded
                          showInfo={showInfo}
                          onToggleInfo={() => setShowInfo((v) => !v)}
                          roomChatVisibility={roomChatVisibility}
                          onRoomChatVisibilityChange={(v) => void handleRoomChatVisibilityChange(v)}
                          canEditPolicies={canEditSpaceRoomPolicies}
                          roomAccessMode={roomAccessMode}
                          onRoomAccessModeChange={(v) => void handleRoomAccessModeChange(v)}
                          onClose={() => setRoomSpaceSettingsOpen(false)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {canManageRoomSpace ? (
                  <button
                    type="button"
                    className="room-invite-btn room-header-manage-icon-btn"
                    onClick={() => setRoomManageModalOpen(true)}
                    title="Управление комнатой"
                    aria-label="Управление комнатой"
                  >
                    <FiRrIcon name="member-list" />
                  </button>
                ) : null}
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

                {isDbSpaceRoomHost && (
                  <div className="room-join-requests-btn-wrap">
                    <button
                      type="button"
                      className={`room-invite-btn${joinRequestsOpen ? ' room-invite-btn--open' : ''}`}
                      onClick={() => { setJoinRequestsOpen((v) => !v); setJoinRequestToast(null) }}
                      title="Запросы на вход"
                      aria-label="Запросы на вход"
                    >
                      <JoinRequestsIcon />
                    </button>
                    {joinRequests.length > 0 && (
                      <span className="room-requests-badge">{joinRequests.length}</span>
                    )}
                  </div>
                )}
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
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="header-dashboard-avatar"
                      />
                    ) : (
                      <span
                        className="header-dashboard-avatar-fallback"
                      >
                        <DashboardIcon />
                      </span>
                    )}
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

      {!isViewportMobile && showLayoutToggle && canUseElevatedRoomTools ? (
        <LayoutCycleFabButton
          className="room-layout-cycle-fab--float"
          onPickNextLayout={() => setLayout((l) => nextLayoutMode(l))}
        />
      ) : null}

      {vmixError && (
        <div className="room-invite-toast room-invite-toast--visible room-invite-toast--error" role="alert">
          <span className="room-invite-toast__title">SRT ошибка</span>
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
              onToggleContactPin={(targetUserId, nextFavorite) => {
                void toggleFavoriteFromChat(targetUserId, nextFavorite)
              }}
              onSend={sendChatGuarded}
              composerLocked={chatComposerLocked}
              composerLockedHint={chatComposerHint}
            />
          </div>
        )}
      </div>

      {canManageRoomSpace ? (
        <RoomManageModal
          open={roomManageModalOpen}
          onClose={() => setRoomManageModalOpen(false)}
          participantCount={rosterCount}
          chatMessageCount={chatMessagesVisibleCount}
          rows={roomManageRows}
          canMutePeers={canRemoteMutePeers}
          canAssignRoomAdmins={canAssignRoomAdmins}
          dbHostUserId={dbHostUserId}
          onMutePeer={(peerId) => requestPeerMicMute?.(peerId)}
          onAssignRoomAdmin={(uid) => void handleAssignRoomAdmin(uid)}
          onRemoveRoomAdmin={(uid) => void handleRemoveRoomAdmin(uid)}
          onRemoveFromRoom={(peerId, opts) => void handleRemoveFromRoom(peerId, opts)}
        />
      ) : null}

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
        onRoomChatVisibilityChange={canEditSpaceRoomPolicies ? handleRoomChatVisibilityChange : undefined}
        showRoomChatPolicySettings={canEditSpaceRoomPolicies}
        roomAccessMode={canEditSpaceRoomPolicies ? roomAccessMode : undefined}
        onRoomAccessModeChange={canEditSpaceRoomPolicies ? handleRoomAccessModeChange : undefined}
        hidePersonalVideoInfoToggle={canManageRoomSpace}
        hideHostRoomPoliciesInChat={canManageRoomSpace}
        showAdminPanelLink={isPlatformAdminish}
        hideVideoLetterboxing={hideVideoLetterboxing}
        onHideVideoLetterboxingChange={setHideVideoLetterboxing}
        canManageVmixProgramIngress={canUseElevatedRoomTools}
        showMobileLayoutCycle={showLayoutToggle}
        showStudioEntry={streamerMode && canUseElevatedRoomTools}
        studioOpen={studioOpen}
        onStudioToggle={() => setStudioOpen((v) => !v)}
        showCouchEntry={!streamerMode && isPlatformAdminish}
        couchOpen={couchOpen}
        onCouchToggle={() => setCouchOpen((v) => !v)}
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
            onToggleContactPin={(targetUserId, nextFavorite) => {
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
            currentUserId={user?.id ?? null}
            contactStatuses={chatContactStatuses}
            onToggleContactPin={(targetUserId, nextFavorite) => {
              void toggleFavoriteFromChat(targetUserId, nextFavorite)
            }}
          />
        </Suspense>
      ) : null}

      {couchOpen ? (
        <Suspense fallback={<div className="join-screen"><div className="auth-loading" aria-label="Загрузка…" /></div>}>
          <CouchModeWorkspace open={couchOpen} onClose={() => setCouchOpen(false)} />
        </Suspense>
      ) : null}

      {/* Тост: новый запрос на вход */}
      {isDbSpaceRoomHost && joinRequestToast ? (
        <div
          className="room-join-request-toast"
          role="status"
          onClick={() => { setJoinRequestsOpen(true); setJoinRequestToast(null) }}
        >
          <span className="room-join-request-toast__icon"><JoinRequestsIcon /></span>
          <span className="room-join-request-toast__text">
            Запрос на вход: <strong>{joinRequestToast}</strong>
          </span>
          <button
            type="button"
            className="room-join-request-toast__action"
            onClick={(e) => { e.stopPropagation(); setJoinRequestsOpen(true); setJoinRequestToast(null) }}
          >
            Посмотреть
          </button>
          <button
            type="button"
            className="room-join-request-toast__close"
            aria-label="Закрыть"
            onClick={(e) => { e.stopPropagation(); setJoinRequestToast(null) }}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Модалка запросов на вход */}
      {isDbSpaceRoomHost && joinRequestsOpen ? (
        <div
          className="room-join-requests-backdrop"
          onClick={() => setJoinRequestsOpen(false)}
        >
          <div
            className="room-join-requests"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="room-join-requests__header">
              <span>Запросы на вход</span>
              {joinRequests.length > 0 && (
                <span className="room-join-requests__count">{joinRequests.length}</span>
              )}
              <button
                type="button"
                className="room-join-requests__close"
                aria-label="Закрыть"
                onClick={() => setJoinRequestsOpen(false)}
              >
                ✕
              </button>
            </div>
            {joinRequests.length === 0 ? (
              <p className="room-join-requests__empty">Нет активных запросов</p>
            ) : (
              joinRequests.map((req) => (
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
              ))
            )}
          </div>
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
  peekUserId,
  showSoloViewerCopy = true,
}: {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
  avatarUrl?: string | null
  peekUserId?: string | null
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
          <ParticipantTileIdle name={name} avatarUrl={avatarUrl} peekUserId={peekUserId ?? undefined} />
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
