import { useState } from 'react'
import { useRoom } from './hooks/useRoom'
import { BrandLogoLoader } from './components/BrandLogoLoader'
import { JoinPage } from './components/JoinPage'
import { RoomPage } from './components/RoomPage'
import { SoloViewerPage } from './components/SoloViewerPage'
import type { VideoPreset } from './types'
import { parseSoloViewerParams, replaceRoomInBrowserUrl } from './utils/soloViewerParams'

export function App() {
  const [name, setName] = useState('')
  const [soloQuery, setSoloQuery] = useState(() => parseSoloViewerParams())

  const {
    join, leave, toggleMute, toggleCam,
    switchCamera, switchMic, changePreset, activePreset,
    status, error,
    localStream, participants,
    isMuted, isCamOff,
    roomId, localPeerId, srtByPeer,
    localScreenStream, isScreenSharing, toggleScreenShare, startScreenShare,
  } = useRoom()

  const handleJoin = (n: string, roomIdParam: string, preset: VideoPreset) => {
    setName(n)
    replaceRoomInBrowserUrl(roomIdParam, { removePeer: true })
    join(n, roomIdParam, preset)
  }

  const handleLeaveRoom = () => {
    const rid = roomId
    leave()
    if (rid) replaceRoomInBrowserUrl(rid, { removePeer: true })
  }

  const exitSoloViewer = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('peer')
    const qs = url.searchParams.toString()
    window.history.replaceState({}, '', `${url.pathname}${qs ? `?${qs}` : ''}`)
    setSoloQuery(null)
  }

  if (soloQuery) {
    return (
      <SoloViewerPage
        roomId={soloQuery.room}
        watchPeerId={soloQuery.peer}
        onExit={exitSoloViewer}
      />
    )
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
        roomId={roomId ?? ''}
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
      />
    )
  }

  return <JoinPage onJoin={handleJoin} error={error} />
}
