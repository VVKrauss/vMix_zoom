import { useState } from 'react'
import { useRoom } from './hooks/useRoom'
import { JoinPage } from './components/JoinPage'
import { RoomPage } from './components/RoomPage'
import type { VideoPreset } from './types'

export function App() {
  const [name, setName] = useState('')

  const {
    join, leave, toggleMute, toggleCam,
    switchCamera, switchMic, changePreset, activePreset,
    status, error,
    localStream, participants,
    isMuted, isCamOff,
    roomId, localPeerId, srtByPeer,
  } = useRoom()

  const handleJoin = (n: string, roomId: string, preset: VideoPreset) => {
    setName(n)
    join(n, roomId, preset)
  }

  if (status === 'connecting') {
    return (
      <div className="loading-screen">
        <div className="spinner" />
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
        onLeave={leave}
        onSwitchCamera={switchCamera}
        onSwitchMic={switchMic}
        activePreset={activePreset}
        onChangePreset={changePreset}
      />
    )
  }

  return <JoinPage onJoin={handleJoin} error={error} />
}
