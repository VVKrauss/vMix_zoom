import { useEffect, useRef, type CSSProperties } from 'react'
import { SrtCopySurface } from './SrtCopyMenu'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import type { RoomReactionBurst } from '../types/roomComms'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'

export type StudioRtmpPhase = 'idle' | 'connecting' | 'live' | 'warning'

interface Props {
  stream: MediaStream
  label: string
  roomId: string
  linkPeerId?: string
  videoStyle: CSSProperties
  showInfo?: boolean
  srtConnectUrl?: string
  srtListenPort?: number
  reactionBurst?: RoomReactionBurst | null
  showSoloViewerCopy?: boolean
  guestMute?: { show: boolean; onMute: () => void }
  /** Состояние RTMP с бэка / эвристика (серый / жёлтый / красный). */
  rtmpPhase: StudioRtmpPhase
}

function RtmpStatusDot({ phase }: { phase: StudioRtmpPhase }) {
  const cls =
    phase === 'live'
      ? 'studio-program-tile__rtmp studio-program-tile__rtmp--live'
      : phase === 'connecting' || phase === 'warning'
        ? 'studio-program-tile__rtmp studio-program-tile__rtmp--warn'
        : 'studio-program-tile__rtmp studio-program-tile__rtmp--idle'
  const title =
    phase === 'live'
      ? 'Эфир: поток на RTMP'
      : phase === 'connecting'
        ? 'Эфир: подключение RTMP'
        : phase === 'warning'
          ? 'Эфир: предупреждение'
          : 'Эфир: RTMP не запущен'
  return <span className={cls} title={title} aria-label={title} />
}

export function StudioProgramShareTile({
  stream,
  label,
  roomId,
  linkPeerId,
  videoStyle,
  showInfo,
  srtConnectUrl,
  srtListenPort,
  reactionBurst,
  showSoloViewerCopy = true,
  guestMute,
  rtmpPhase,
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
    <div className="participant-card participant-card--studio-program">
      <div className="card-video-wrap">
        <SrtCopySurface
          connectUrl={srtConnectUrl}
          listenPort={srtListenPort}
          roomId={roomId}
          tilePeerId={linkPeerId}
          showSoloViewerCopy={showSoloViewerCopy}
          guestMute={guestMute}
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
          <div className="studio-program-tile__chrome">
            <span className="studio-program-tile__badge">Эфир</span>
            <RtmpStatusDot phase={rtmpPhase} />
          </div>
          {showInfo && (
            <VideoInfoOverlay
              stream={stream}
              videoRef={videoRef}
              roomId={roomId}
              peerId={linkPeerId}
              srtConnectUrl={srtConnectUrl}
              showSoloViewerCopy={showSoloViewerCopy}
            />
          )}
          {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
        </SrtCopySurface>
      </div>
      <div className="participant-card__label">{label}</div>
    </div>
  )
}
