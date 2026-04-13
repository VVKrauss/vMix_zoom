import { CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react'
import type { RemoteParticipant } from '../types'
import type { RoomReactionBurst } from '../types/roomComms'
import type { InboundVideoQuality } from '../utils/inboundVideoStats'
import type { ContactStatus } from '../lib/socialGraph'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'
import { ParticipantTileIdle } from './ParticipantTileIdle'
import { AudioMeter } from './AudioMeter'
import { useBindPlayout } from '../hooks/useMediaPlayout'
import { SrtCopySurface, type SrtCopyMenuExtraItem } from './SrtCopyMenu'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import { StarIcon } from './icons'
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
  getPeerUplinkVideoQuality?: (peerId: string) => Promise<InboundVideoQuality | null>
  showSoloViewerCopy?: boolean
  guestMute?: { show: boolean; onMute: () => void }
  guestKick?: { show: boolean; onKick: () => void; onBan?: () => void }
  onOpenDirectChat?: (participant: RemoteParticipant) => void
  currentUserId?: string | null
  /** Статус избранного/друзей для участника с authUserId */
  contactStatus?: ContactStatus | null
  /** Переключить избранное (только для чужого залогиненного участника) */
  onToggleFavorite?: () => void
}

export function ParticipantCard({
  participant, videoStyle, style, showInfo, showMeter = false, roomId = '',
  srtConnectUrl, srtListenPort,
  playoutVolume = 1,
  playoutSinkId = '',
  reactionBurst,
  badge,
  getPeerUplinkVideoQuality,
  showSoloViewerCopy = true,
  guestMute,
  guestKick,
  onOpenDirectChat,
  currentUserId,
  contactStatus,
  onToggleFavorite,
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
    if (!getPeerUplinkVideoQuality) return Promise.resolve(null)
    return getPeerUplinkVideoQuality(participant.peerId)
  }, [getPeerUplinkVideoQuality, participant.peerId])

  const linkQuality = useInboundVideoQualityPoll(
    Boolean(getPeerUplinkVideoQuality && hasIncomingPicture),
    fetchInboundQuality,
  )

  const extraMenuItems = useMemo((): SrtCopyMenuExtraItem[] => {
    const uid = participant.authUserId?.trim()
    const me = currentUserId?.trim()
    const out: SrtCopyMenuExtraItem[] = []
    if (uid && me && uid !== me && onOpenDirectChat) {
      out.push({
        key: 'dm',
        label: 'Личный чат',
        onSelect: () => onOpenDirectChat(participant),
      })
    }
    if (uid && me && uid !== me && onToggleFavorite) {
      out.push({
        key: 'fav',
        label: contactStatus?.isFavorite ? 'Убрать из избранного' : 'В избранное',
        onSelect: onToggleFavorite,
      })
    }
    return out
  }, [
    participant,
    currentUserId,
    onOpenDirectChat,
    onToggleFavorite,
    contactStatus?.isFavorite,
  ])

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
          showSoloViewerCopy={showSoloViewerCopy}
          guestMute={guestMute}
          guestKick={guestKick}
          extraMenuItems={extraMenuItems}
          showTileOverflowButton
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
              <ParticipantTileIdle
                name={participant.name}
                avatarUrl={participant.avatarUrl}
                peekUserId={participant.authUserId?.trim() || undefined}
              />
            </div>
          )}
          <audio ref={audioRef} autoPlay playsInline />

          {getPeerUplinkVideoQuality && hasIncomingPicture ? (
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
              showSoloViewerCopy={showSoloViewerCopy}
              linkQuality={
                getPeerUplinkVideoQuality && hasIncomingPicture ? linkQuality : undefined
              }
            />
          )}
          {reactionBurst && <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} />}
        </SrtCopySurface>
      </div>
      <div className="card-bar">
        <div className="card-bar-title">
          <span className="card-name">{participant.name}</span>
          {onToggleFavorite &&
          participant.authUserId?.trim() &&
          currentUserId?.trim() &&
          participant.authUserId.trim() !== currentUserId.trim() ? (
            <button
              type="button"
              className={`card-bar-fav${contactStatus?.isFavorite ? ' card-bar-fav--on' : ''}`}
              onClick={onToggleFavorite}
              title={contactStatus?.isFavorite ? 'Убрать из избранного' : 'В избранное'}
              aria-label={contactStatus?.isFavorite ? 'Убрать из избранного' : 'В избранное'}
            >
              <StarIcon filled={contactStatus?.isFavorite ?? false} />
            </button>
          ) : null}
        </div>
        {badge && <span className="card-badge">{badge}</span>}
      </div>
    </div>
  )
}
