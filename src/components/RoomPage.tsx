import { useEffect, useRef, useState } from 'react'
import React from 'react'
import { ControlsBar } from './ControlsBar'
import { ParticipantCard } from './ParticipantCard'
import { DraggablePip } from './DraggablePip'
import { AudioMeter } from './AudioMeter'
import { useDevices } from '../hooks/useDevices'
import type { TileAspect } from '../hooks/useTileLayout'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import type { PipPos, PipSize } from './DraggablePip'
import type { RemoteParticipant } from '../types'

export type LayoutMode = 'grid' | 'pip'
export type ObjectFit = 'cover' | 'contain'

interface Props {
  name: string
  localStream: MediaStream | null
  participants: Map<string, RemoteParticipant>
  isMuted: boolean
  isCamOff: boolean
  onToggleMute: () => void
  onToggleCam: () => void
  onLeave: () => void
  onSwitchCamera: (id: string) => void
  onSwitchMic: (id: string) => void
}

export function RoomPage({
  name, localStream, participants,
  isMuted, isCamOff,
  onToggleMute, onToggleCam, onLeave,
  onSwitchCamera, onSwitchMic,
}: Props) {
  const [layout, setLayout]         = useState<LayoutMode>('pip')
  const [objectFit, setObjectFit]   = useState<ObjectFit>('contain')
  const [tileAspect, setTileAspect] = useState<TileAspect>('free')
  const [showInfo, setShowInfo]     = useState(false)
  const [sourceAspect, setSourceAspect] = useState<number | null>(null)

  // PiP position & size — persisted across layout switches, reset only on "Сброс"
  const [pipPos,  setPipPos]  = useState<PipPos> ({ x: 16,  y: 10  })
  const [pipSize, setPipSize] = useState<PipSize>({ w: 220, h: 148 })

  const remoteList = [...participants.values()]
  const total      = remoteList.length + 1

  const {
    cameras, microphones,
    selectedCameraId, selectedMicId,
    setSelectedCameraId, setSelectedMicId,
    enumerate,
  } = useDevices()

  useEffect(() => { if (localStream) enumerate() }, [localStream, enumerate])

  // Track native aspect ratio of the local video source
  useEffect(() => {
    if (!localStream) { setSourceAspect(null); return }
    const track = localStream.getVideoTracks()[0]
    if (!track) { setSourceAspect(null); return }
    const s = track.getSettings()
    if (s.width && s.height) setSourceAspect(s.width / s.height)
  }, [localStream])

  const resetView = () => {
    setLayout('pip')
    setObjectFit('contain')
    setTileAspect('free')
    setPipPos ({ x: 16,  y: 10  })
    setPipSize({ w: 220, h: 148 })
  }

  // Remote video: fill tile, honour objectFit (cover/contain)
  const remoteVideoStyle: React.CSSProperties = {
    width: '100%', height: '100%', objectFit,
  }

  // Local preview video style
  const localVideoStyle = (inPip: boolean): React.CSSProperties => {
    if (inPip) {
      // PiP: video always fills the (possibly aspect-locked) container 100%×100%
      return { width: '100%', height: '100%', objectFit: 'fill' }
    }
    // Grid mode
    if (tileAspect === 'free') {
      return { width: '100%', height: 'auto', objectFit, display: 'block' }
    }
    return {
      width: '100%',
      height: 'auto',
      aspectRatio: tileAspect === '16:9' ? '16 / 9' : '4 / 3',
      objectFit: 'fill',
      display: 'block',
    }
  }

  // In PiP: container is always aspect-locked (no "cover/free resize" mode)
  // tileAspect drives the lock ratio; 'free' uses the source's native ratio
  const pipLockAspect: number | null =
    tileAspect === '16:9' ? 16 / 9 :
    tileAspect === '4:3'  ? 4  / 3 :
    sourceAspect

  const gridStyle = (cols: number): React.CSSProperties => ({
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
  })

  const localTile = (inPip: boolean) => (
    <LocalTile
      stream={localStream}
      name={name}
      isMuted={isMuted}
      isCamOff={isCamOff}
      videoStyle={localVideoStyle(inPip)}
      tileAspect={tileAspect}
      onAspectChange={setTileAspect}
      showInfo={showInfo}
    />
  )

  return (
    <div className="room-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="room-header">
        <div className="room-logo">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#e53935" />
            <path d="M8 13h14v14H8V13zm16 3l8-4v16l-8-4V16z" fill="white" />
          </svg>
          <span>vMix Streamer</span>
        </div>

        <div className="header-right">
          {/* Layout switcher */}
          <div className="layout-switcher" title="Раскладка">
            <button
              className={`layout-btn ${layout === 'grid' ? 'layout-btn--active' : ''}`}
              onClick={() => setLayout('grid')} title="Сетка"
            ><GridIcon /></button>
            <button
              className={`layout-btn ${layout === 'pip' ? 'layout-btn--active' : ''}`}
              onClick={() => setLayout('pip')} title="Превью поверх"
            ><PipIcon /></button>
          </div>

          {/* Object-fit toggle — only in grid mode */}
          {layout === 'grid' && (
            <button
              className={`layout-btn fit-btn ${objectFit === 'contain' ? 'layout-btn--active' : ''}`}
              onClick={() => setObjectFit(f => f === 'cover' ? 'contain' : 'cover')}
              title={objectFit === 'cover' ? 'Показать полный кадр' : 'Заполнить тайл'}
            >
              <FitIcon contain={objectFit === 'contain'} />
              <span className="fit-label">{objectFit === 'contain' ? 'Полный' : 'Заполнить'}</span>
            </button>
          )}

          {/* Reset view */}
          <button className="reset-btn" onClick={resetView} title="Сбросить вид">
            <ResetIcon />
            Сброс
          </button>

          {/* Tech info toggle */}
          <button
            className={`reset-btn info-toggle-btn ${showInfo ? 'info-toggle-btn--active' : ''}`}
            onClick={() => setShowInfo(v => !v)}
            title="Техническая информация о потоке"
          >
            <InfoIcon />
            Инфо
          </button>

          <span className="room-count">
            {total} участник{total === 1 ? '' : total < 5 ? 'а' : 'ов'}
          </span>
        </div>
      </header>

      {/* ── Grid layout ────────────────────────────────────────────────── */}
      {layout === 'grid' && (
        <div className="tile-grid" style={gridStyle(gridCols(total))}>
          {localTile(false)}
          {remoteList.map(p => (
            <ParticipantCard key={p.peerId} participant={p}
              objectFit={objectFit} videoStyle={remoteVideoStyle} />
          ))}
        </div>
      )}

      {/* ── PiP layout ─────────────────────────────────────────────────── */}
      {layout === 'pip' && (
        <div className="pip-container">
          <div className="tile-grid pip-grid" style={gridStyle(gridCols(remoteList.length || 1))}>
            {remoteList.length === 0
              ? <div className="pip-waiting">Ожидание участников…</div>
              : remoteList.map(p => (
                  <ParticipantCard key={p.peerId} participant={p}
                    objectFit={objectFit} videoStyle={remoteVideoStyle} />
                ))
            }
          </div>
          <DraggablePip
            pos={pipPos}   onPosChange={setPipPos}
            size={pipSize} onSizeChange={setPipSize}
            lockAspect={pipLockAspect}
          >
            {localTile(true)}
          </DraggablePip>
        </div>
      )}

      <ControlsBar
        isMuted={isMuted}
        isCamOff={isCamOff}
        cameras={cameras}
        microphones={microphones}
        selectedCameraId={selectedCameraId}
        selectedMicId={selectedMicId}
        onToggleMute={onToggleMute}
        onToggleCam={onToggleCam}
        onLeave={onLeave}
        onSwitchCamera={id => { setSelectedCameraId(id); onSwitchCamera(id) }}
        onSwitchMic={id => { setSelectedMicId(id); onSwitchMic(id) }}
      />
    </div>
  )
}

// ─── Local tile ───────────────────────────────────────────────────────────────

function LocalTile({
  stream, name, isMuted, isCamOff, videoStyle, tileAspect, onAspectChange, showInfo,
}: {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
  videoStyle: React.CSSProperties
  tileAspect?: TileAspect
  onAspectChange?: (a: TileAspect) => void
  showInfo?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div className="participant-card participant-card--local">
      <div className="card-video-wrap">
        <video
          ref={videoRef}
          autoPlay playsInline muted
          className={isCamOff ? 'hidden' : ''}
          style={videoStyle}
        />
        {isCamOff && <div className="cam-off-avatar">{name.charAt(0).toUpperCase()}</div>}
        {!isMuted && <AudioMeter stream={stream} stereo />}
        {showInfo && <VideoInfoOverlay stream={stream} videoRef={videoRef} />}

        {/* Aspect ratio overlay — only in grid mode (when onAspectChange is provided) */}
        {tileAspect && onAspectChange && (
          <div className="tile-aspect-overlay">
            {(['16:9', '4:3', 'free'] as TileAspect[]).map(a => (
              <button
                key={a}
                className={`tile-aspect-btn ${tileAspect === a ? 'tile-aspect-btn--active' : ''}`}
                onClick={e => { e.stopPropagation(); onAspectChange(a) }}
                title={a === 'free' ? 'Свободно' : a}
              >
                {a === 'free' ? '⊡' : a}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="card-bar">
        <span className="card-name">{name} (вы)</span>
        {isMuted && <MutedSvg />}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gridCols(n: number): number {
  if (n <= 1) return 1
  if (n <= 2) return 2
  if (n <= 4) return 2
  if (n <= 6) return 3
  return 3
}

function MutedSvg() {
  return (
    <svg className="muted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  )
}

function PipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="14" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="8" width="6" height="6" rx="1" />
    </svg>
  )
}

function ResetIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="8" strokeLinecap="round" strokeWidth="3" />
      <line x1="12" y1="12" x2="12" y2="16" strokeLinecap="round" />
    </svg>
  )
}

function FitIcon({ contain }: { contain: boolean }) {
  return contain ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <rect x="4" y="5" width="8" height="6" rx=".5" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <rect x="2" y="2" width="12" height="12" rx="1" fill="currentColor" stroke="none" fillOpacity=".4" />
    </svg>
  )
}
