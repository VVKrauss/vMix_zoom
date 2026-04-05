import { useEffect, useMemo, useRef, useState } from 'react'
import React from 'react'
import { ControlsBar } from './ControlsBar'
import { ParticipantCard } from './ParticipantCard'
import { DraggablePip } from './DraggablePip'
import { AudioMeter } from './AudioMeter'
import { useDevices } from '../hooks/useDevices'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import type { PipPos, PipSize } from './DraggablePip'
import type { RemoteParticipant, SrtSessionInfo, VideoPreset } from '../types'

export type LayoutMode = 'grid' | 'pip'
export type ObjectFit = 'cover' | 'contain'

interface Props {
  name: string
  localStream: MediaStream | null
  participants: Map<string, RemoteParticipant>
  roomId: string
  localPeerId: string
  srtByPeer: Record<string, SrtSessionInfo>
  isMuted: boolean
  isCamOff: boolean
  onToggleMute: () => void
  onToggleCam: () => void
  onLeave: () => void
  onSwitchCamera: (id: string) => void
  onSwitchMic: (id: string) => void
  activePreset: VideoPreset
  onChangePreset: (p: VideoPreset) => void
}

export function RoomPage({
  name, localStream, participants,
  roomId, localPeerId, srtByPeer,
  isMuted, isCamOff,
  onToggleMute, onToggleCam, onLeave,
  onSwitchCamera, onSwitchMic,
  activePreset, onChangePreset,
}: Props) {
  const isMobile = window.innerWidth <= 768
  const [layout, setLayout]       = useState<LayoutMode>(isMobile ? 'grid' : 'pip')
  const [objectFit, setObjectFit] = useState<ObjectFit>('contain')
  const [showInfo, setShowInfo]   = useState(false)
  const [showMeter, setShowMeter] = useState(true)
  const [sourceAspect, setSourceAspect] = useState<number | null>(null)
  const [pipPos,  setPipPos]  = useState<PipPos> ({ x: 16,  y: 10  })
  const [pipSize, setPipSize] = useState<PipSize>(
    isMobile ? { w: 140, h: 94 } : { w: 220, h: 148 }
  )

  const remoteList = useMemo(() => [...participants.values()], [participants])
  const total      = remoteList.length + 1

  const {
    cameras, microphones,
    selectedCameraId, selectedMicId,
    setSelectedCameraId, setSelectedMicId,
    enumerate,
  } = useDevices()

  useEffect(() => { if (localStream) enumerate() }, [localStream, enumerate])

  useEffect(() => {
    if (!localStream) { setSourceAspect(null); return }
    const track = localStream.getVideoTracks()[0]
    if (!track) { setSourceAspect(null); return }
    const s = track.getSettings()
    if (s.width && s.height) setSourceAspect(s.width / s.height)
  }, [localStream])

  const resetView = () => {
    setLayout(isMobile ? 'grid' : 'pip')
    setObjectFit('contain')
    setPipPos ({ x: 16,  y: 10  })
    setPipSize(isMobile ? { w: 140, h: 94 } : { w: 220, h: 148 })
  }

  const remoteVideoStyle: React.CSSProperties = useMemo(
    () => ({ width: '100%', height: '100%', objectFit }),
    [objectFit],
  )

  const localVideoStyle = (inPip: boolean): React.CSSProperties => {
    if (inPip) return { width: '100%', height: '100%', objectFit: 'fill' }
    return { width: '100%', height: 'auto', objectFit, display: 'block' }
  }

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
      showInfo={showInfo}
      showMeter={showMeter}
      roomId={roomId}
      peerId={localPeerId}
      srtConnectUrl={srtByPeer[localPeerId]?.connectUrlPublic}
    />
  )

  const participantCount = total === 1
    ? '1 участник'
    : total < 5
      ? `${total} участника`
      : `${total} участников`

  return (
    <div className="room-page">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="room-header">
        <div className="room-logo">
          <img className="brand-logo brand-logo--header" src="/logo.png" alt="" width={28} height={28} />
          <span>redflow.online</span>
        </div>

        <div className="room-center">
          <span className="room-name">{roomId}</span>
          <span className="room-count">({participantCount})</span>
        </div>

        <div className="header-right">
          {!isMobile && (
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
          )}
        </div>
      </header>

      {/* ── Grid layout ────────────────────────────────────────────────── */}
      {layout === 'grid' && (
        <div className="tile-grid" style={gridStyle(gridCols(total))}>
          {localTile(false)}
          {remoteList.map(p => (
            <ParticipantCard key={p.peerId} participant={p}
              videoStyle={remoteVideoStyle}
              showInfo={showInfo} showMeter={showMeter} roomId={roomId}
              srtConnectUrl={srtByPeer[p.peerId]?.connectUrlPublic} />
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
                    videoStyle={remoteVideoStyle}
                    showInfo={showInfo} showMeter={showMeter} roomId={roomId}
                    srtConnectUrl={srtByPeer[p.peerId]?.connectUrlPublic} />
                ))
            }
          </div>
          <DraggablePip
            pos={pipPos}   onPosChange={setPipPos}
            size={pipSize} onSizeChange={setPipSize}
            lockAspect={sourceAspect}
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
        activePreset={activePreset}
        onChangePreset={onChangePreset}
        objectFit={objectFit}
        onObjectFitToggle={() => setObjectFit(f => f === 'cover' ? 'contain' : 'cover')}
        layout={layout}
        showMeter={showMeter}
        onToggleMeter={() => setShowMeter(v => !v)}
        showInfo={showInfo}
        onToggleInfo={() => setShowInfo(v => !v)}
        onResetView={resetView}
      />
    </div>
  )
}

// ─── Local tile ───────────────────────────────────────────────────────────────

function LocalTile({
  stream, name, isMuted, isCamOff, videoStyle, showInfo, showMeter,
  roomId, peerId, srtConnectUrl,
}: {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
  videoStyle: React.CSSProperties
  showInfo?: boolean
  showMeter?: boolean
  roomId: string
  peerId: string
  srtConnectUrl?: string
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
        {showMeter && !isMuted && <AudioMeter stream={stream} stereo />}
        {showInfo && (
          <VideoInfoOverlay
            stream={stream}
            videoRef={videoRef}
            roomId={roomId}
            peerId={peerId}
            srtConnectUrl={srtConnectUrl}
          />
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
