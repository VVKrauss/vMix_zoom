import { useState } from 'react'
import { JoinForm } from './components/JoinForm'
import { Room } from './components/Room'
import { useMediasoup } from './hooks/useMediasoup'

export function App() {
  const [displayName, setDisplayName] = useState<string | null>(null)

  const {
    join,
    leave,
    toggleAudio,
    toggleVideo,
    localStream,
    remotePeers,
    mySrtPort,
    isAudioMuted,
    isVideoOff,
    status,
    errorMsg,
  } = useMediasoup(displayName)

  const handleJoin = async (name: string) => {
    setDisplayName(name)
    // join() called via useEffect below via displayName change
    // We call it directly after setting name
    await join()
  }

  // Wrap to ensure name is set before join
  const handleLeave = () => {
    leave()
    setDisplayName(null)
  }

  if (status === 'idle' || status === 'error') {
    return (
      <>
        <JoinForm onJoin={handleJoin} />
        {errorMsg && (
          <div className="error-toast">
            <strong>Ошибка подключения:</strong> {errorMsg}
          </div>
        )}
      </>
    )
  }

  if (status === 'connecting') {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Подключение…</p>
      </div>
    )
  }

  return (
    <Room
      displayName={displayName!}
      localStream={localStream}
      remotePeers={remotePeers}
      mySrtPort={mySrtPort}
      isAudioMuted={isAudioMuted}
      isVideoOff={isVideoOff}
      onToggleAudio={toggleAudio}
      onToggleVideo={toggleVideo}
      onLeave={handleLeave}
    />
  )
}
