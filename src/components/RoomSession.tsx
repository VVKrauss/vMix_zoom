import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorageBool } from '../hooks/useLocalStorage'
import { useRoom, type JoinRoomMediaOptions, type RoomStatus, type RoomClosedReason } from '../hooks/useRoom'
import { BrandLogoLoader } from './BrandLogoLoader'
import { JoinPage } from './JoinPage'
import { RoomPage } from './RoomPage'
import { RoomHostClaimModal } from './RoomHostClaimModal'
import { RoomJoinApprovalWaiting } from './RoomJoinApprovalWaiting'
import type { VideoPreset } from '../types'
import { replaceRoomInBrowserUrl } from '../utils/soloViewerParams'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  clearHostSessionIfMatches,
  clearPendingHostClaim,
  matchesPendingHostClaim,
  hostLeaveSpaceRoom,
  isSessionHostFor,
  getSpaceRoomJoinStatus,
  markSessionAsHostFor,
  registerSpaceRoomAsHost,
  takeSpaceRoomCreateOptions,
} from '../lib/spaceRoom'

const CHAT_PREVIEW_TOAST_MS = 7000
const ROOM_AUTO_RESUME_KEY_PREFIX = 'vmix_room_auto_resume:'

type StoredRoomAutoResume = {
  roomId: string
  name: string
  preset: VideoPreset
  media: JoinRoomMediaOptions
}

function roomAutoResumeKey(roomId: string): string {
  return `${ROOM_AUTO_RESUME_KEY_PREFIX}${roomId.trim()}`
}

function readRoomAutoResume(roomId: string): StoredRoomAutoResume | null {
  const trimmed = roomId.trim()
  if (!trimmed) return null
  try {
    const raw = window.sessionStorage.getItem(roomAutoResumeKey(trimmed))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRoomAutoResume> | null
    if (!parsed || parsed.roomId !== trimmed || !parsed.name || !parsed.preset || !parsed.media) return null
    return {
      roomId: trimmed,
      name: String(parsed.name),
      preset: parsed.preset as VideoPreset,
      media: parsed.media as JoinRoomMediaOptions,
    }
  } catch {
    return null
  }
}

function writeRoomAutoResume(data: StoredRoomAutoResume): void {
  try {
    window.sessionStorage.setItem(roomAutoResumeKey(data.roomId), JSON.stringify(data))
  } catch {
    /* noop */
  }
}

function clearRoomAutoResume(roomId: string): void {
  const trimmed = roomId.trim()
  if (!trimmed) return
  try {
    window.sessionStorage.removeItem(roomAutoResumeKey(trimmed))
  } catch {
    /* noop */
  }
}

interface Props {
  roomId: string
}

export function RoomSession({ roomId }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { allowed: canAccessAdminPanel } = useCanAccessAdminPanel()
  const [name, setName] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)
  const [chatIncomingPreview, setChatIncomingPreview] = useState<{
    author: string
    text: string
  } | null>(null)
  const chatOpenRef = useRef(false)
  const chatPreviewTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [chatToastNotifications, setChatToastNotifications] = useLocalStorageBool(
    'vmix_chat_toast_notifications',
    true,
  )
  const chatToastNotificationsRef = useRef(chatToastNotifications)
  chatToastNotificationsRef.current = chatToastNotifications
  const autoResumeTriedRef = useRef(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  /** Хост открыл комнату с нового устройства: предлагаем перехватить управление. */
  const [hostClaimMode, setHostClaimMode] = useState(false)
  /** Комната требует одобрения хоста (access_mode=approval). Показываем JoinPage первой. */
  const needsApprovalRef = useRef(false)
  /** Пользователь ждёт одобрения хоста (access_mode=approval). */
  const [waitingApproval, setWaitingApproval] = useState(false)
  /** Параметры, введённые на JoinPage, — ждут авто-подключения после одобрения. */
  const [pendingJoin, setPendingJoin] = useState<{
    name: string
    rid: string
    preset: VideoPreset
    media: JoinRoomMediaOptions
  } | null>(null)

  const dismissChatIncomingPreview = useCallback(() => {
    if (chatPreviewTimerRef.current != null) {
      window.clearTimeout(chatPreviewTimerRef.current)
      chatPreviewTimerRef.current = null
    }
    setChatIncomingPreview(null)
  }, [])

  const roomActivityNotifyRef = useRef({
    isChatClosed: () => !chatOpenRef.current,
    bumpUnread: () => setChatUnreadCount((c) => c + 1),
    flashChatPreview: (author: string, text: string) => {
      if (!chatToastNotificationsRef.current) return
      const trimmed = text.trim()
      if (!trimmed) return
      const safeAuthor = author.trim() || 'Участник'
      const snippet = trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
      setChatIncomingPreview({ author: safeAuthor, text: snippet })
      if (chatPreviewTimerRef.current != null) window.clearTimeout(chatPreviewTimerRef.current)
      chatPreviewTimerRef.current = window.setTimeout(() => {
        setChatIncomingPreview(null)
        chatPreviewTimerRef.current = null
      }, CHAT_PREVIEW_TOAST_MS)
    },
  })

  useLayoutEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  useEffect(() => {
    if (!chatOpen) return
    setChatUnreadCount(0)
    setChatIncomingPreview(null)
    if (chatPreviewTimerRef.current != null) {
      window.clearTimeout(chatPreviewTimerRef.current)
      chatPreviewTimerRef.current = null
    }
  }, [chatOpen])

  const {
    join, leave, toggleMute, toggleCam,
    switchCamera, switchMic, changePreset, activePreset,
    status, error,
    connectionState, reconnectAttempt,
    localStream, participants,
    isMuted, isCamOff,
    roomId: connectedRoomId, localPeerId, srtByPeer,
    localScreenStream, localScreenPeerId, isScreenSharing, toggleScreenShare, startScreenShare,
    chatMessages, sendChatMessage, sendReaction, reactionBursts,
    remoteScreenConsumePending,
    remoteStudioProgramConsumePending,
    remoteStudioRtmpByPeer,
    startVmixIngress, stopVmixIngress, vmixIngressInfo, vmixIngressLoading,
    getPeerUplinkVideoQuality,
    requestPeerMicMute,
    requestKickPeer,
    startStudioPreview,
    stopStudioPreview,
    startStudioProgram,
    stopStudioProgram,
    replaceStudioProgramAudioTrack,
    endRoomForAll,
    studioBroadcastHealth,
    studioBroadcastHealthDetail,
    studioServerLogLines,
    roomClosedReason,
  } = useRoom(roomActivityNotifyRef)

  useEffect(() => {
    if (status !== 'connected') return
    document.documentElement.classList.add('app-root--room')
    return () => document.documentElement.classList.remove('app-root--room')
  }, [status])

  const statusRef = useRef<RoomStatus>('idle')
  statusRef.current = status

  const leaveRef = useRef(leave)
  leaveRef.current = leave

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const startPayload = { roomId, userId: user?.id ?? null }
      console.log('[room-session] joinable check:start', startPayload)
      const { joinable, denial, isDbHost } = await getSpaceRoomJoinStatus(roomId, user?.id ?? null)
      const resultPayload = { roomId, ok: joinable, denial, isDbHost, userId: user?.id ?? null }
      console.log('[room-session] joinable check:result', resultPayload)

      if (cancelled) return

      if (!joinable) {
        if (denial === 'approval_required') {
          // Показываем JoinPage первой — пользователь введёт имя, потом увидит ожидание
          needsApprovalRef.current = true
        } else {
          navigate('/room-closed', {
            replace: true,
            state: {
              roomId,
              reason:
                denial === 'invite_expired'
                  ? 'invite_expired'
                  : denial === 'banned'
                    ? 'banned'
                    : undefined,
            },
          })
        }
        return
      }

      // Хост открыл комнату с другого устройства/вкладки — показываем диалог перехвата управления
      const slug = roomId.trim()
      if (
        isDbHost &&
        user?.id &&
        !isSessionHostFor(slug) &&
        !matchesPendingHostClaim(slug)
      ) {
        setHostClaimMode(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [roomId, navigate, user?.id])

  useEffect(() => {
    if (!roomClosedReason) return
    navigate('/room-closed', { replace: true, state: { roomId, reason: roomClosedReason as RoomClosedReason } })
  }, [roomClosedReason, navigate, roomId])

  // Только настоящий unmount: `leave` меняется при каждом обновлении localStream — если
  // поставить [leave], cleanup предыдущего эффекта вызовет leave() и сорвёт join.
  useEffect(() => () => {
    if (statusRef.current === 'idle') return
    leaveRef.current()
  }, [])

  /** Реальное подключение к комнате (вызывается после всех проверок). */
  const executeJoin = useCallback(async (n: string, rid: string, preset: VideoPreset, media: JoinRoomMediaOptions) => {
    const trimmedRid = rid.trim()
    console.log('[room-session] executeJoin:start', { roomId: trimmedRid, userId: user?.id ?? null })
    if (user?.id && matchesPendingHostClaim(trimmedRid)) {
      clearPendingHostClaim()
      const createOpts = takeSpaceRoomCreateOptions(trimmedRid)
      const ok = await registerSpaceRoomAsHost(trimmedRid, user.id, createOpts ?? undefined)
      console.log('[room-session] registerSpaceRoomAsHost', { roomId: trimmedRid, userId: user.id, ok })
      if (ok) markSessionAsHostFor(trimmedRid)
    }
    setName(n)
    writeRoomAutoResume({ roomId: trimmedRid, name: n.trim(), preset, media })
    replaceRoomInBrowserUrl(rid, { removePeer: true })
    join(n, rid, preset, {
      ...media,
      avatarUrl: (user?.user_metadata?.avatar_url as string | undefined) ?? null,
      authUserId: user?.id ?? null,
      canManageRoom: isSessionHostFor(trimmedRid) || canAccessAdminPanel,
    })
  }, [user, canAccessAdminPanel, join])

  /** Обработчик кнопки «Войти» на JoinPage. */
  const handleJoin = useCallback(async (n: string, rid: string, preset: VideoPreset, media: JoinRoomMediaOptions) => {
    // Если комната требует одобрения — сохраняем параметры и показываем экран ожидания
    if (needsApprovalRef.current) {
      const trimmedRid = rid.trim()
      setPendingJoin({ name: n, rid: trimmedRid, preset, media })
      setWaitingApproval(true)
      return
    }
    await executeJoin(n, rid, preset, media)
  }, [executeJoin])

  const handleLeaveRoom = async () => {
    if (leaveBusy) return
    const rid = (connectedRoomId ?? roomId).trim()
    const canEndRoomForEveryone = isSessionHostFor(rid) || canAccessAdminPanel
    const leavePayload = {
      roomId: rid,
      userId: user?.id ?? null,
      isSessionHost: isSessionHostFor(rid),
      canEndRoomForEveryone,
      connectedRoomId,
      routeRoomId: roomId,
    }
    console.log('[room-session] handleLeaveRoom', leavePayload)
    setLeaveBusy(true)
    try {
      setChatOpen(false)
      if (canEndRoomForEveryone) {
        const res = await endRoomForAll()
        if (!res.ok) {
          console.error('[room-session] endRoomForAll failed', { roomId: rid, error: res.error })
          window.alert(res.error ?? 'Не удалось завершить звонок для всех. Попробуйте ещё раз.')
          return
        }
        if (user?.id && isSessionHostFor(rid)) {
          void hostLeaveSpaceRoom(rid)
          clearHostSessionIfMatches(rid)
        }
        clearRoomAutoResume(rid)
        navigate('/', { replace: true })
        return
      }

      if (user?.id && isSessionHostFor(rid)) {
        void hostLeaveSpaceRoom(rid)
        clearHostSessionIfMatches(rid)
      }
      clearRoomAutoResume(rid)
      leave()
      navigate('/', { replace: true })
    } finally {
      setLeaveBusy(false)
    }
  }

  useEffect(() => {
    if (status !== 'idle' || error || roomClosedReason) return
    if (autoResumeTriedRef.current) return
    const stored = readRoomAutoResume(roomId)
    if (!stored) return
    autoResumeTriedRef.current = true
    void handleJoin(stored.name, stored.roomId, stored.preset, stored.media)
  }, [error, handleJoin, roomClosedReason, roomId, status])

  useEffect(() => {
    if (!roomClosedReason) return
    clearRoomAutoResume(roomId)
  }, [roomClosedReason, roomId])

  useEffect(() => {
    const onVisibility = () => {
      const payload = {
        roomId,
        hidden: document.hidden,
        status,
      }
      console.log('[room-session] visibilitychange', payload)
    }
    const onPageHide = () => {
      const payload = { roomId, status }
      console.log('[room-session] pagehide', payload)
    }
    const onPageShow = () => {
      const payload = { roomId, status }
      console.log('[room-session] pageshow', payload)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [roomId, status])

  if (status === 'connecting') {
    return (
      <div className="loading-screen">
        <BrandLogoLoader />
        <p>Подключение…</p>
      </div>
    )
  }

  if (status === 'connected') {
    return (
      <RoomPage
        name={name}
        localStream={localStream}
        participants={participants}
        roomId={connectedRoomId ?? ''}
        localPeerId={localPeerId ?? ''}
        srtByPeer={srtByPeer}
        isMuted={isMuted}
        isCamOff={isCamOff}
        onToggleMute={toggleMute}
        onToggleCam={toggleCam}
        onLeave={handleLeaveRoom}
        onSwitchCamera={switchCamera}
        onSwitchMic={switchMic}
        activePreset={activePreset}
        onChangePreset={changePreset}
        localScreenStream={localScreenStream}
        localScreenPeerId={localScreenPeerId}
        isScreenSharing={isScreenSharing}
        onToggleScreenShare={toggleScreenShare}
        onStartScreenShare={startScreenShare}
        chatMessages={chatMessages}
        onSendChatMessage={sendChatMessage}
        onSendReaction={sendReaction}
        reactionBursts={reactionBursts}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        chatUnreadCount={chatUnreadCount}
        chatIncomingPreview={chatIncomingPreview}
        onDismissChatIncomingPreview={dismissChatIncomingPreview}
        chatToastNotifications={chatToastNotifications}
        onToggleChatToastNotifications={() => setChatToastNotifications((v) => !v)}
        remoteScreenSharePending={remoteScreenConsumePending}
        remoteStudioProgramConsumePending={remoteStudioProgramConsumePending}
        remoteStudioRtmpByPeer={remoteStudioRtmpByPeer}
        vmixIngressInfo={vmixIngressInfo}
        vmixIngressLoading={vmixIngressLoading}
        onStartVmixIngress={startVmixIngress}
        onStopVmixIngress={stopVmixIngress}
        getPeerUplinkVideoQuality={getPeerUplinkVideoQuality}
        requestPeerMicMute={requestPeerMicMute}
        requestKickPeer={requestKickPeer}
        startStudioPreview={startStudioPreview}
        stopStudioPreview={stopStudioPreview}
        startStudioProgram={startStudioProgram}
        stopStudioProgram={stopStudioProgram}
        replaceStudioProgramAudioTrack={replaceStudioProgramAudioTrack}
        studioBroadcastHealth={studioBroadcastHealth}
        studioBroadcastHealthDetail={studioBroadcastHealthDetail}
        studioServerLogLines={studioServerLogLines}
        connectionState={connectionState}
        reconnectAttempt={reconnectAttempt}
        leaveEndsRoomForAll={isSessionHostFor((connectedRoomId ?? roomId).trim()) || canAccessAdminPanel}
      />
    )
  }

  if (hostClaimMode) {
    return (
      <RoomHostClaimModal
        roomId={roomId}
        onTakeover={() => {
          markSessionAsHostFor(roomId.trim())
          setHostClaimMode(false)
        }}
        onJoinAsParticipant={() => {
          setHostClaimMode(false)
        }}
      />
    )
  }

  if (waitingApproval && pendingJoin) {
    return (
      <RoomJoinApprovalWaiting
        roomId={roomId}
        userId={user?.id ?? null}
        displayName={pendingJoin.name}
        onApproved={() => {
          needsApprovalRef.current = false
          setWaitingApproval(false)
          const p = pendingJoin
          setPendingJoin(null)
          void executeJoin(p.name, p.rid, p.preset, p.media)
        }}
        onBack={() => {
          setWaitingApproval(false)
          setPendingJoin(null)
          navigate('/')
        }}
      />
    )
  }

  return (
    <JoinPage
      roomId={roomId}
      onJoin={handleJoin}
      onBackToHome={() => navigate('/')}
      error={error}
    />
  )
}
