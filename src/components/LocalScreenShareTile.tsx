import { useEffect, useRef, type CSSProperties } from 'react'
import { SrtCopySurface } from './SrtCopyMenu'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import type { RoomReactionBurst } from '../types/roomComms'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'

interface Props {
  stream: MediaStream
  /** Подпись в полоске (например имя + «экран») */
  label: string
  roomId: string
  /** Реальный peerId владельца — для соло-ссылки и SRT */
  ownerPeerId: string
  videoStyle: CSSProperties
  showInfo?: boolean
  srtConnectUrl?: string
  srtListenPort?: number
  onStopShare: () => void
  showPin?: boolean
  pinActive?: boolean
  onRequestPin?: () => void
  reactionBurst?: RoomReactionBurst | null
}

export function LocalScreenShareTile({
  stream,
  label,
  roomId,
  ownerPeerId,
  videoStyle,
  showInfo,
  srtConnectUrl,
  srtListenPort,
  onStopShare,
  showPin,
  pinActive,
  onRequestPin,
  reactionBurst,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [stream])

  return (
    <div className="participant-card participant-card--screen-share">
      <div className="card-video-wrap">
        <SrtCopySurface
          connectUrl={srtConnectUrl}
          listenPort={srtListenPort}
          roomId={roomId}
          tilePeerId={ownerPeerId}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="participant-card__main-video"
            style={videoStyle}
          />
          {showInfo && (
            <VideoInfoOverlay
              stream={stream}
              videoRef={videoRef}
              roomId={roomId}
              peerId={ownerPeerId}
              srtConnectUrl={srtConnectUrl}
            />
          )}
          {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
        </SrtCopySurface>
      </div>
      <div className="card-bar">
        <span className="card-name">{label}</span>
        <span className="card-bar-actions">
          <button
            type="button"
            className="card-stop-share-btn"
            onClick={(e) => {
              e.stopPropagation()
              onStopShare()
            }}
            title="Завершить демонстрацию для всех"
          >
            Завершить
          </button>
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
        </span>
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
