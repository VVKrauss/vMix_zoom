import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLocalStorageBool } from '../hooks/useLocalStorage'
import { useRoom, type JoinRoomMediaOptions, type RoomStatus } from '../hooks/useRoom'
import { BrandLogoLoader } from './BrandLogoLoader'
import { JoinPage } from './JoinPage'
import { RoomPage } from './RoomPage'
import type { VideoPreset } from '../types'
import { replaceRoomInBrowserUrl } from '../utils/soloViewerParams'
import { useAuth } from '../context/AuthContext'
import {
  clearHostSessionIfMatches,
  clearPendingHostClaim,
  matchesPendingHostClaim,
  hostLeaveSpaceRoom,
  isSessionHostFor,
  isSpaceRoomJoinable,
  markSessionAsHostFor,
  registerSpaceRoomAsHost,
} from '../lib/spaceRoom'

const CHAT_PREVIEW_TOAST_MS = 7000

interface Props {
  roomId: string
}

export function RoomSession({ roomId }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
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
    localStream, participants,
    isMuted, isCamOff,
    roomId: connectedRoomId, localPeerId, srtByPeer,
    localScreenStream, localScreenPeerId, isScreenSharing, toggleScreenShare, startScreenShare,
    chatMessages, sendChatMessage, sendReaction, reactionBursts,
    remoteScreenConsumePending,
    startVmixIngress, stopVmixIngress, vmixIngressInfo, vmixIngressLoading,
    getRemoteInboundVideoQuality,
    requestPeerMicMute,
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
      const ok = await isSpaceRoomJoinable(roomId)
      if (!cancelled && !ok) {
        navigate('/room-closed', { replace: true, state: { roomId } })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [roomId, navigate])

  // Только настоящий unmount: `leave` меняется при каждом обновлении localStream — если
  // поставить [leave], cleanup предыдущего эффекта вызовет leave() и сорвёт join.
  useEffect(() => () => {
    if (statusRef.current === 'idle') return
    leaveRef.current()
  }, [])

  const handleJoin = async (n: string, rid: string, preset: VideoPreset, media: JoinRoomMediaOptions) => {
    const trimmedRid = rid.trim()
    if (user?.id && matchesPendingHostClaim(trimmedRid)) {
      clearPendingHostClaim()
      const ok = await registerSpaceRoomAsHost(trimmedRid, user.id)
      if (ok) markSessionAsHostFor(trimmedRid)
    }
    setName(n)
    replaceRoomInBrowserUrl(rid, { removePeer: true })
    join(n, rid, preset, {
      ...media,
      avatarUrl: (user?.user_metadata?.avatar_url as string | undefined) ?? null,
      authUserId: user?.id ?? null,
    })
  }

  const handleLeaveRoom = () => {
    const rid = (connectedRoomId ?? roomId).trim()
    if (user?.id && isSessionHostFor(rid)) {
      void hostLeaveSpaceRoom(rid)
      clearHostSessionIfMatches(rid)
    }
    setChatOpen(false)
    leave()
    navigate('/', { replace: true })
  }

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
        vmixIngressInfo={vmixIngressInfo}
        vmixIngressLoading={vmixIngressLoading}
        onStartVmixIngress={startVmixIngress}
        onStopVmixIngress={stopVmixIngress}
        getRemoteInboundVideoQuality={getRemoteInboundVideoQuality}
        requestPeerMicMute={requestPeerMicMute}
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
