import { VideoTile } from './VideoTile'
import { Controls } from './Controls'
import type { RemotePeer } from '../types'

interface Props {
  displayName: string
  localStream: MediaStream | null
  remotePeers: Map<string, RemotePeer>
  mySrtPort: number | null
  isAudioMuted: boolean
  isVideoOff: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onLeave: () => void
}

export function Room({
  displayName,
  localStream,
  remotePeers,
  mySrtPort,
  isAudioMuted,
  isVideoOff,
  onToggleAudio,
  onToggleVideo,
  onLeave,
}: Props) {
  const peers = [...remotePeers.values()]
  const totalTiles = 1 + peers.length
  const gridClass = getGridClass(totalTiles)

  return (
    <div className="room">
      {/* Header */}
      <header className="room__header">
        <div className="room__logo">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#e53935" />
            <path d="M8 13h14v14H8V13zm16 3l8-4v16l-8-4V16z" fill="white" />
          </svg>
          <span>vMix Streamer</span>
        </div>
        <div className="room__header-right">
          <span className="room__participant-count">{totalTiles} участник{pluralRu(totalTiles)}</span>
        </div>
      </header>

      {/* Video grid */}
      <div className={`grid ${gridClass}`}>
        {/* Local tile first */}
        <VideoTile
          stream={localStream}
          displayName={displayName}
          srtPort={mySrtPort ?? undefined}
          isLocal
          isAudioMuted={isAudioMuted}
          isVideoOff={isVideoOff}
          isSrtActive={mySrtPort !== null}
        />

        {/* Remote tiles */}
        {peers.map((peer) => (
          <VideoTile
            key={peer.peerId}
            stream={peer.videoStream}
            displayName={peer.displayName}
            srtPort={peer.srtPort}
            isSrtActive={peer.videoStream !== null}
          />
        ))}
      </div>

      {/* Controls */}
      <Controls
        isAudioMuted={isAudioMuted}
        isVideoOff={isVideoOff}
        onToggleAudio={onToggleAudio}
        onToggleVideo={onToggleVideo}
        onLeave={onLeave}
      />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGridClass(count: number): string {
  if (count === 1) return 'grid--1'
  if (count === 2) return 'grid--2'
  if (count <= 4) return 'grid--4'
  if (count <= 6) return 'grid--6'
  return 'grid--9'
}

function pluralRu(n: number): string {
  if (n === 1) return ''
  if (n >= 2 && n <= 4) return 'а'
  return 'ов'
}
