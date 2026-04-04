import { useState } from 'react'
import { useRoom } from './hooks/useRoom'
import { JoinPage } from './components/JoinPage'
import { RoomPage } from './components/RoomPage'

export function App() {
  const [name, setName] = useState('')

  const {
    join, leave, toggleMute, toggleCam,
    status, error,
    localStream, participants,
    isMuted, isCamOff,
  } = useRoom()

  const handleJoin = (n: string, roomId: string) => {
    setName(n)
    join(n, roomId)
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
        isMuted={isMuted}
        isCamOff={isCamOff}
        onToggleMute={toggleMute}
        onToggleCam={toggleCam}
        onLeave={leave}
      />
    )
  }

  return <JoinPage onJoin={handleJoin} error={error} />
}
