import { CSSProperties, useEffect, useRef } from 'react'
import type { RemoteParticipant } from '../types'
import type { RoomReactionBurst } from '../types/roomComms'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'
import { AudioMeter } from './AudioMeter'
import { useBindPlayout } from '../hooks/useMediaPlayout'
import { SrtCopySurface } from './SrtCopyMenu'
import { VideoInfoOverlay } from './VideoInfoOverlay'

interface Props {
  participant: RemoteParticipant
  videoStyle?: CSSProperties
  style?: CSSProperties
  showInfo?: boolean
  showMeter?: boolean
  roomId?: string
  srtConnectUrl?: string
  srtListenPort?: number
  /** 0…1, громкость удалённого участника */
  playoutVolume?: number
  /** deviceId выхода (Chrome и др.) */
  playoutSinkId?: string
  reactionBurst?: RoomReactionBurst | null
  badge?: string | null
}

export function ParticipantCard({
  participant, videoStyle, style, showInfo, showMeter = false, roomId = '',
  srtConnectUrl, srtListenPort,
  playoutVolume = 1,
  playoutSinkId = '',
  reactionBurst,
  badge,
}: Props) {
  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  /** Только камера; демонстрация — отдельная плитка `peerId::screen`. */
  const mainStream = participant.videoStream ?? null

  useEffect(() => {
    if (mainVideoRef.current) mainVideoRef.current.srcObject = mainStream
  }, [mainStream])

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = participant.audioStream ?? null
  }, [participant.audioStream])

  useBindPlayout(mainVideoRef, playoutVolume, playoutSinkId, !!mainStream)
  useBindPlayout(audioRef, playoutVolume, playoutSinkId, !!participant.audioStream)

  const hasVideo = !!mainStream

  return (
    <div className="participant-card" style={style}>
      <div className="card-video-wrap">
        <SrtCopySurface
          connectUrl={srtConnectUrl}
          listenPort={srtListenPort}
          roomId={roomId}
          tilePeerId={participant.peerId}
        >
          <video
            ref={mainVideoRef}
            autoPlay
            playsInline
            className={hasVideo ? 'participant-card__main-video' : 'participant-card__main-video hidden'}
            style={videoStyle}
          />
          {!hasVideo && (
            <div className="cam-off-avatar">
              <span className="cam-off-avatar__label">{participant.name}</span>
            </div>
          )}
          <audio ref={audioRef} autoPlay playsInline />

          {showMeter && <AudioMeter stream={participant.audioStream ?? null} />}
          {showInfo && (
            <VideoInfoOverlay
              stream={mainStream}
              videoRef={mainVideoRef}
              roomId={roomId}
              peerId={participant.peerId}
              srtConnectUrl={srtConnectUrl}
            />
          )}
          {reactionBurst && <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} />}
        </SrtCopySurface>
      </div>
      <div className="card-bar">
        <span className="card-name">{participant.name}</span>
        {badge && <span className="card-badge">{badge}</span>}
      </div>
    </div>
  )
}
