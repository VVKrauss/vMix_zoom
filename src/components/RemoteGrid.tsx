import { ParticipantCard } from './ParticipantCard'
import type { RemoteParticipant } from '../types'

interface Props {
  participants: Map<string, RemoteParticipant>
}

export function RemoteGrid({ participants }: Props) {
  const list = [...participants.values()]

  if (list.length === 0) {
    return (
      <div className="remote-empty">
        <p>Ожидание участников…</p>
      </div>
    )
  }

  return (
    <div className={`remote-grid remote-grid--${Math.min(list.length, 9)}`}>
      {list.map((p) => (
        <ParticipantCard key={p.peerId} participant={p} />
      ))}
    </div>
  )
}
