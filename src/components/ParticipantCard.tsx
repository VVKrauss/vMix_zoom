import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useVideoFrames } from '../hooks/useVideoFrames'

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
  /** Статус контактов для участника с authUserId */
  contactStatus?: ContactStatus | null
  /** Добавить / убрать из контактов (чужой залогиненный участник) */
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
  const [micGainOpen, setMicGainOpen] = useState(false)
  const [micGain, setMicGain] = useState(1)

  const micGainKey = useMemo(() => {
    const rid = roomId?.trim() ?? ''
    const pid = participant.peerId?.trim() ?? ''
    if (!rid || !pid) return ''
    return `vmix:mix:mic:${rid}:${pid}`
  }, [roomId, participant.peerId])

  /** Только камера; демонстрация — отдельная плитка `peerId::screen`. */
  const mainStream = participant.videoStream ?? null
  const hasVideo = !!mainStream
  const hasFrames = useVideoFrames(mainVideoRef, hasVideo)
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
        label: contactStatus?.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты',
        onSelect: onToggleFavorite,
      })
    }
    return out
  }, [
    participant,
    currentUserId,
    onOpenDirectChat,
    onToggleFavorite,
    contactStatus?.pinnedByMe,
  ])

  useEffect(() => {
    if (mainVideoRef.current) mainVideoRef.current.srcObject = mainStream
  }, [mainStream])

  useEffect(() => {
    if (audioRef.current) audioRef.current.srcObject = participant.audioStream ?? null
  }, [participant.audioStream])

  useBindPlayout(mainVideoRef, playoutVolume, playoutSinkId, !!mainStream)
  useBindPlayout(audioRef, playoutVolume * micGain, playoutSinkId, !!participant.audioStream)

  useEffect(() => {
    if (!micGainKey || typeof window === 'undefined') return
    const raw = window.localStorage.getItem(micGainKey)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isFinite(n)) setMicGain(Math.max(0, Math.min(2, n)))
  }, [micGainKey])

  useEffect(() => {
    if (!micGainKey || typeof window === 'undefined') return
    window.localStorage.setItem(micGainKey, String(Math.max(0, Math.min(2, micGain))))
  }, [micGain, micGainKey])

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
          {hasVideo ? (
            <video
              ref={mainVideoRef}
              autoPlay
              playsInline
              className="participant-card__main-video"
              style={videoStyle}
            />
          ) : null}
          {!hasVideo || !hasFrames ? (
            <div className="cam-off-avatar">
              <ParticipantTileIdle
                name={participant.name}
                avatarUrl={participant.avatarUrl}
                peekUserId={participant.authUserId?.trim() || undefined}
              />
            </div>
          ) : null}
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
              className={`card-bar-fav${contactStatus?.pinnedByMe ? ' card-bar-fav--on' : ''}`}
              onClick={onToggleFavorite}
              title={contactStatus?.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты'}
              aria-label={contactStatus?.pinnedByMe ? 'Убрать из контактов' : 'Добавить в контакты'}
            >
              <StarIcon filled={contactStatus?.pinnedByMe ?? false} />
            </button>
          ) : null}
        </div>
        {badge && <span className="card-badge">{badge}</span>}
        {participant.audioStream ? (
          <span className="card-bar-actions">
            <button
              type="button"
              className="card-bar-fav"
              title="Громкость микрофона"
              aria-label="Громкость микрофона"
              onClick={(e) => {
                e.stopPropagation()
                setMicGainOpen((v) => !v)
              }}
            >
              🔊
            </button>
            {micGainOpen ? (
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 44,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(10,8,7,0.75)',
                  backdropFilter: 'blur(10px)',
                  zIndex: 6,
                  width: 180,
                }}
                role="group"
                aria-label="Громкость микрофона"
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, opacity: 0.85 }}>Микрофон</span>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{Math.round(micGain * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={Math.round(micGain * 100)}
                  onChange={(e) => setMicGain(Number(e.target.value) / 100)}
                  style={{ width: '100%' }}
                />
              </div>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  )
}
