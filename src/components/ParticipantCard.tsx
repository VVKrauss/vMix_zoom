import { CSSProperties, useCallback, useEffect, useRef } from 'react'
import type { RemoteParticipant } from '../types'
import type { RoomReactionBurst } from '../types/roomComms'
import type { InboundVideoQuality } from '../utils/inboundVideoStats'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'
import { AudioMeter } from './AudioMeter'
import { useBindPlayout } from '../hooks/useMediaPlayout'
import { SrtCopySurface } from './SrtCopyMenu'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import { RemoteVideoSignalBars, useInboundVideoQualityPoll } from './RemoteVideoSignalBars'

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
  /** Статистика входящего camera/vmix видео (не экран); без пропа — без индикатора. */
  getRemoteInboundVideoQuality?: (peerId: string) => Promise<InboundVideoQuality | null>
}

export function ParticipantCard({
  participant, videoStyle, style, showInfo, showMeter = false, roomId = '',
  srtConnectUrl, srtListenPort,
  playoutVolume = 1,
  playoutSinkId = '',
  reactionBurst,
  badge,
  getRemoteInboundVideoQuality,
}: Props) {
  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  /** Только камера; демонстрация — отдельная плитка `peerId::screen`. */
  const mainStream = participant.videoStream ?? null
  const hasVideo = !!mainStream
  /** Индикатор качества и getStats только когда реально идёт входящее видео (камера/vmix включены). */
  const hasIncomingPicture = Boolean(
    mainStream?.getVideoTracks().some((t) => t.readyState === 'live'),
  )

  const fetchInboundQuality = useCallback(() => {
    if (!getRemoteInboundVideoQuality) return Promise.resolve(null)
    return getRemoteInboundVideoQuality(participant.peerId)
  }, [getRemoteInboundVideoQuality, participant.peerId])

  const linkQuality = useInboundVideoQualityPoll(
    Boolean(getRemoteInboundVideoQuality && hasIncomingPicture),
    fetchInboundQuality,
  )

  useEffect(() => {
    if (mainVideoRef.current) mainVideoRef.current.srcObject = mainStream
  }, [mainStream])

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = participant.audioStream ?? null
  }, [participant.audioStream])

  useBindPlayout(mainVideoRef, playoutVolume, playoutSinkId, !!mainStream)
  useBindPlayout(audioRef, playoutVolume, playoutSinkId, !!participant.audioStream)

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

          {getRemoteInboundVideoQuality && hasIncomingPicture ? (
            <RemoteVideoSignalBars quality={linkQuality} />
          ) : null}
          {showMeter && <AudioMeter stream={participant.audioStream ?? null} />}
          {showInfo && (
            <VideoInfoOverlay
              stream={mainStream}
              videoRef={mainVideoRef}
              roomId={roomId}
              peerId={participant.peerId}
              srtConnectUrl={srtConnectUrl}
              linkQuality={
                getRemoteInboundVideoQuality && hasIncomingPicture ? linkQuality : undefined
              }
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
