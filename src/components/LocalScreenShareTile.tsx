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
  /**
   * Отдельный peerId продюсера экрана (с бэка / `screenPeerId` в ack produce).
   * Только он попадает в соло-URL и «скопировать peerId»; без него эти пункты скрыты
   * (не подставляем id камеры — иначе ссылка совпадает с плиткой гостя).
   */
  linkPeerId?: string
  videoStyle: CSSProperties
  showInfo?: boolean
  srtConnectUrl?: string
  srtListenPort?: number
  onStopShare?: () => void
  reactionBurst?: RoomReactionBurst | null
}

export function LocalScreenShareTile({
  stream,
  label,
  roomId,
  linkPeerId,
  videoStyle,
  showInfo,
  srtConnectUrl,
  srtListenPort,
  onStopShare,
  reactionBurst,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  return (
    <div className="participant-card participant-card--screen-share">
      <div className="card-video-wrap">
        <SrtCopySurface
          connectUrl={srtConnectUrl}
          listenPort={srtListenPort}
          roomId={roomId}
          tilePeerId={linkPeerId}
        >
          <video
            key={stream.id}
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
              peerId={linkPeerId}
              srtConnectUrl={srtConnectUrl}
            />
          )}
          {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
        </SrtCopySurface>
      </div>
      <div className="card-bar">
        <span className="card-name">{label}</span>
        <span className="card-bar-actions">
          {onStopShare ? (
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
          ) : null}
        </span>
      </div>
    </div>
  )
}
