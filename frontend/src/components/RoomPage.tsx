import { useEffect, useRef, useState } from 'react'
import { ControlsBar } from './ControlsBar'
import { ParticipantCard } from './ParticipantCard'
import { DraggablePip } from './DraggablePip'
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
}

export function RoomPage({
  name, localStream, participants,
  isMuted, isCamOff,
  onToggleMute, onToggleCam, onLeave,
}: Props) {
  const [layout, setLayout] = useState<LayoutMode>('pip')
  const [objectFit, setObjectFit] = useState<ObjectFit>('contain')
  const [pipKey, setPipKey] = useState(0)

  const resetView = () => {
    setLayout('pip')
    setObjectFit('contain')
    setPipKey(k => k + 1)
  }
  const remoteList = [...participants.values()]
  const total = remoteList.length + 1

  const localTile = (
    <LocalTile
      stream={localStream}
      name={name}
      isMuted={isMuted}
      isCamOff={isCamOff}
      objectFit={objectFit}
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
              onClick={() => setLayout('grid')}
              title="Сетка"
            >
              <GridIcon />
            </button>
            <button
              className={`layout-btn ${layout === 'pip' ? 'layout-btn--active' : ''}`}
              onClick={() => setLayout('pip')}
              title="Превью поверх"
            >
              <PipIcon />
            </button>
          </div>

          {/* Object-fit toggle */}
          <button
            className={`layout-btn fit-btn ${objectFit === 'contain' ? 'layout-btn--active' : ''}`}
            onClick={() => setObjectFit(f => f === 'cover' ? 'contain' : 'cover')}
            title={objectFit === 'cover' ? 'Показать полный кадр (contain)' : 'Заполнить тайл (cover)'}
          >
            <FitIcon contain={objectFit === 'contain'} />
            <span className="fit-label">{objectFit === 'contain' ? 'Полный' : 'Заполнить'}</span>
          </button>

          {/* Reset view */}
          <button className="reset-btn" onClick={resetView} title="Сбросить вид">
            <ResetIcon />
            Сброс
          </button>

          <span className="room-count">
            {total} участник{total === 1 ? '' : total < 5 ? 'а' : 'ов'}
          </span>
        </div>
      </header>

      {/* ── Grid layout ────────────────────────────────────────────────── */}
      {layout === 'grid' && (
        <div className={`tile-grid ${getGridClass(total)}`}>
          {localTile}
          {remoteList.map(p => (
            <ParticipantCard key={p.peerId} participant={p} objectFit={objectFit} />
          ))}
        </div>
      )}

      {/* ── PiP layout ─────────────────────────────────────────────────── */}
      {layout === 'pip' && (
        <div className="pip-container">
          <div className={`tile-grid ${getGridClass(remoteList.length || 1)}`}>
            {remoteList.length === 0
              ? <div className="pip-waiting">Ожидание участников…</div>
              : remoteList.map(p => (
                  <ParticipantCard key={p.peerId} participant={p} objectFit={objectFit} />
                ))
            }
          </div>

          {/* Draggable + resizable local preview */}
          <DraggablePip key={pipKey}>
            {localTile}
          </DraggablePip>
        </div>
      )}

      <ControlsBar
        isMuted={isMuted}
        isCamOff={isCamOff}
        onToggleMute={onToggleMute}
        onToggleCam={onToggleCam}
        onLeave={onLeave}
      />
    </div>
  )
}

// ─── Local tile ───────────────────────────────────────────────────────────────

function LocalTile({
  stream, name, isMuted, isCamOff, objectFit,
}: {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
  objectFit: ObjectFit
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
          style={{ objectFit }}
        />
        {isCamOff && <div className="cam-off-avatar">{name.charAt(0).toUpperCase()}</div>}
      </div>
      <div className="card-bar">
        <span className="card-name">{name} (вы)</span>
        {isMuted && <MutedSvg />}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGridClass(total: number): string {
  if (total <= 1) return 'tile-grid--1'
  if (total === 2) return 'tile-grid--2'
  if (total <= 4) return 'tile-grid--4'
  if (total <= 6) return 'tile-grid--6'
  return 'tile-grid--9'
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
