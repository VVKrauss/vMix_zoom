import { LocalVideo } from './LocalVideo'
import { RemoteGrid } from './RemoteGrid'
import { ControlsBar } from './ControlsBar'
import type { RemoteParticipant } from '../types'

interface Props {
  name: string
  localStream: MediaStream | null
  participants: Map<string, RemoteParticipant>
  isMuted: boolean
  isCamOff: boolean
  onToggleMute: () => void
  onToggleCam: () => void
  onLeave: () => void
}

export function RoomPage({
  name,
  localStream,
  participants,
  isMuted,
  isCamOff,
  onToggleMute,
  onToggleCam,
  onLeave,
}: Props) {
  const total = participants.size + 1

  return (
    <div className="room-page">
      <header className="room-header">
        <div className="room-logo">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#e53935" />
            <path d="M8 13h14v14H8V13zm16 3l8-4v16l-8-4V16z" fill="white" />
          </svg>
          <span>vMix Streamer</span>
        </div>
        <span className="room-count">
          {total} участник{total === 1 ? '' : total < 5 ? 'а' : 'ов'}
        </span>
      </header>

      <div className="room-body">
        {/* Local tile always visible */}
        <LocalVideo
          stream={localStream}
          name={name}
          isMuted={isMuted}
          isCamOff={isCamOff}
        />

        {/* Remote participants */}
        <RemoteGrid participants={participants} />
      </div>

      <ControlsBar
        isMuted={isMuted}
        isCamOff={isCamOff}
        onToggleMute={onToggleMute}
        onToggleCam={onToggleCam}
        onLeave={onLeave}
      />
    </div>
  )
}
