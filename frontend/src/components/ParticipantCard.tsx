import { useEffect, useRef } from 'react'
import type { RemoteParticipant } from '../types'

interface Props {
  participant: RemoteParticipant
  objectFit?: 'cover' | 'contain'
}

export function ParticipantCard({ participant, objectFit = 'cover' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = participant.videoStream ?? null
  }, [participant.videoStream])

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = participant.audioStream ?? null
  }, [participant.audioStream])

  const hasVideo = !!participant.videoStream

  return (
    <div className="participant-card">
      <div className="card-video-wrap">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={hasVideo ? '' : 'hidden'}
          style={{ objectFit }}
        />
        {!hasVideo && (
          <div className="cam-off-avatar">{participant.name.charAt(0).toUpperCase()}</div>
        )}
        <audio ref={audioRef} autoPlay playsInline />
      </div>
      <div className="card-bar">
        <span className="card-name">{participant.name}</span>
      </div>
    </div>
  )
}
