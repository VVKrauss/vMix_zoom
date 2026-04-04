import { useEffect, useRef } from 'react'
import type { RemoteParticipant } from '../types'

interface Props {
  participant: RemoteParticipant
}

export function ParticipantCard({ participant }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.videoStream ?? null
    }
  }, [participant.videoStream])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = participant.audioStream ?? null
    }
  }, [participant.audioStream])

  const hasVideo = !!participant.videoStream

  return (
    <div className="participant-card">
      <div className="card-video-wrap">
        {/* VIDEO — only when stream exists */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={hasVideo ? '' : 'hidden'}
        />

        {/* No video placeholder */}
        {!hasVideo && (
          <div className="cam-off-avatar">
            {participant.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* AUDIO — separate, never rendered visually */}
        <audio ref={audioRef} autoPlay playsInline />
      </div>

      <div className="card-bar">
        <span className="card-name">{participant.name}</span>
      </div>
    </div>
  )
}
