import { useEffect, useRef } from 'react'
import { ControlsBar } from './ControlsBar'
import { ParticipantCard } from './ParticipantCard'
import type { RemoteParticipant } from '../types'

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
  name,
  localStream,
  participants,
  isMuted,
  isCamOff,
  onToggleMute,
  onToggleCam,
  onLeave,
}: Props) {
  const total = participants.size + 1
  const gridClass = getGridClass(total)

  return (
    <div className="room-page">
      <header className="room-header">
        <div className="room-logo">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#e53935" />
            <path d="M8 13h14v14H8V13zm16 3l8-4v16l-8-4V16z" fill="white" />
          </svg>
          <span>vMix Streamer</span>
        </div>
        <span className="room-count">
          {total} участник{total === 1 ? '' : total < 5 ? 'а' : 'ов'}
        </span>
      </header>

      {/* Единая сетка — локальный + удалённые */}
      <div className={`tile-grid ${gridClass}`}>
        <LocalTile
          stream={localStream}
          name={name}
          isMuted={isMuted}
          isCamOff={isCamOff}
        />
        {[...participants.values()].map((p) => (
          <ParticipantCard key={p.peerId} participant={p} />
        ))}
      </div>

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

// ─── Local tile (inline, no separate file needed) ─────────────────────────────

function LocalTile({
  stream,
  name,
  isMuted,
  isCamOff,
}: {
  stream: MediaStream | null
  name: string
  isMuted: boolean
  isCamOff: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <div className="participant-card participant-card--local">
      <div className="card-video-wrap">
        <video ref={videoRef} autoPlay playsInline muted className={isCamOff ? 'hidden' : ''} />
        {isCamOff && <div className="cam-off-avatar">{name.charAt(0).toUpperCase()}</div>}
      </div>
      <div className="card-bar">
        <span className="card-name">{name} (вы)</span>
        {isMuted && (
          <svg className="muted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
            <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
          </svg>
        )}
      </div>
    </div>
  )
}

// ─── Grid class helper ────────────────────────────────────────────────────────

function getGridClass(total: number): string {
  if (total === 1) return 'tile-grid--1'
  if (total === 2) return 'tile-grid--2'
  if (total <= 4) return 'tile-grid--4'
  if (total <= 6) return 'tile-grid--6'
  return 'tile-grid--9'
}
