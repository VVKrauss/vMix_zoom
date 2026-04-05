import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRoom, type RoomStatus } from '../hooks/useRoom'
import { BrandLogoLoader } from './BrandLogoLoader'
import { JoinPage } from './JoinPage'
import { RoomPage } from './RoomPage'
import type { VideoPreset } from '../types'
import { replaceRoomInBrowserUrl } from '../utils/soloViewerParams'

interface Props {
  roomId: string
}

export function RoomSession({ roomId }: Props) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)
  const chatOpenRef = useRef(false)

  const roomActivityNotifyRef = useRef({
    isChatClosed: () => !chatOpenRef.current,
    bumpUnread: () => setChatUnreadCount((c) => c + 1),
  })

  useLayoutEffect(() => {
    chatOpenRef.current = chatOpen
  }, [chatOpen])

  useEffect(() => {
    if (chatOpen) setChatUnreadCount(0)
  }, [chatOpen])

  const {
    join, leave, toggleMute, toggleCam,
    switchCamera, switchMic, changePreset, activePreset,
    status, error,
    localStream, participants,
    isMuted, isCamOff,
    roomId: connectedRoomId, localPeerId, srtByPeer,
    localScreenStream, isScreenSharing, toggleScreenShare, startScreenShare,
    chatMessages, sendChatMessage, sendReaction, reactionBursts,
  } = useRoom(roomActivityNotifyRef)

  const statusRef = useRef<RoomStatus>('idle')
  statusRef.current = status

  const leaveRef = useRef(leave)
  leaveRef.current = leave

  // Только настоящий unmount: `leave` меняется при каждом обновлении localStream — если
  // поставить [leave], cleanup предыдущего эффекта вызовет leave() и сорвёт join.
  useEffect(() => () => {
    if (statusRef.current === 'idle') return
    leaveRef.current()
  }, [])

  const handleJoin = (n: string, rid: string, preset: VideoPreset) => {
    setName(n)
    replaceRoomInBrowserUrl(rid, { removePeer: true })
    join(n, rid, preset)
  }

  const handleLeaveRoom = () => {
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
