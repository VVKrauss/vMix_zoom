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
  showPin?: boolean
  pinActive?: boolean
  onRequestPin?: () => void
  reactionBurst?: RoomReactionBurst | null
}

export function ParticipantCard({
  participant, videoStyle, style, showInfo, showMeter = true, roomId = '',
  srtConnectUrl, srtListenPort,
  playoutVolume = 1,
  playoutSinkId = '',
  showPin, pinActive, onRequestPin,
  reactionBurst,
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
            <div className="cam-off-avatar">{participant.name.charAt(0).toUpperCase()}</div>
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
        {showPin && onRequestPin && (
          <button
            type="button"
            className={`card-pin-btn ${pinActive ? 'card-pin-btn--on' : ''}`}
            title={pinActive ? 'Снять закрепление' : 'Закрепить в режиме спикера'}
            aria-pressed={pinActive}
            onClick={(e) => {
              e.stopPropagation()
              onRequestPin()
            }}
          >
            <PinIcon />
          </button>
        )}
      </div>
    </div>
  )
}

function PinIcon() {
  return (
    <svg className="card-pin-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
    </svg>
  )
}
