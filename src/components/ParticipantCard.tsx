import { CSSProperties, useEffect, useRef } from 'react'
import type { RemoteParticipant } from '../types'
import { AudioMeter } from './AudioMeter'
import { VideoInfoOverlay } from './VideoInfoOverlay'

interface Props {
  participant: RemoteParticipant
  videoStyle?: CSSProperties
  style?: CSSProperties
  showInfo?: boolean
  showMeter?: boolean
  roomId?: string
  srtConnectUrl?: string
}

export function ParticipantCard({
  participant, videoStyle, style, showInfo, showMeter = true, roomId = '',
  srtConnectUrl,
}: Props) {
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
    <div className="participant-card" style={style}>
      <div className="card-video-wrap">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={hasVideo ? '' : 'hidden'}
          style={videoStyle}
        />
        {!hasVideo && (
          <div className="cam-off-avatar">{participant.name.charAt(0).toUpperCase()}</div>
        )}
        <audio ref={audioRef} autoPlay playsInline />

        {showMeter && <AudioMeter stream={participant.audioStream ?? null} />}
        {showInfo && (
          <VideoInfoOverlay
            stream={participant.videoStream ?? null}
            videoRef={videoRef}
            roomId={roomId}
            peerId={participant.peerId}
            srtConnectUrl={srtConnectUrl}
          />
        )}
      </div>
      <div className="card-bar">
        <span className="card-name">{participant.name}</span>
      </div>
    </div>
  )
}
