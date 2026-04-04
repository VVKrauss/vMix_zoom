import { useState } from 'react'
import { DevicePopover } from './DevicePopover'

interface Props {
  isMuted: boolean
  isCamOff: boolean
  layout?: string
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCameraId: string
  selectedMicId: string
  onToggleMute: () => void
  onToggleCam: () => void
  onLeave: () => void
  onSwitchCamera: (deviceId: string) => void
  onSwitchMic: (deviceId: string) => void
}

type OpenPopover = 'mic' | 'cam' | null

export function ControlsBar({
  isMuted, isCamOff,
  cameras, microphones, selectedCameraId, selectedMicId,
  onToggleMute, onToggleCam, onLeave,
  onSwitchCamera, onSwitchMic,
}: Props) {
  const [open, setOpen] = useState<OpenPopover>(null)

  const toggleOpen = (which: OpenPopover) =>
    setOpen(prev => prev === which ? null : which)

  return (
    <div className="controls-bar">

      {/* ── Microphone ─────────────────────────────────────────────────── */}
      <div className="ctrl-group">
        <button
          className={`ctrl-btn ${isMuted ? 'ctrl-btn--off' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {isMuted ? <MicOffIcon /> : <MicIcon />}
          <span>{isMuted ? 'Включить' : 'Звук'}</span>
        </button>
        <button
          className={`ctrl-chevron ${isMuted ? 'ctrl-btn--off' : ''} ${open === 'mic' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('mic')}
          title="Выбрать микрофон"
        >
          <ChevronIcon />
        </button>

        {open === 'mic' && (
          <DevicePopover
            label="Микрофон"
            devices={microphones}
            selectedId={selectedMicId}
            onSelect={id => { onSwitchMic(id) }}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      {/* ── Camera ─────────────────────────────────────────────────────── */}
      <div className="ctrl-group">
        <button
          className={`ctrl-btn ${isCamOff ? 'ctrl-btn--off' : ''}`}
          onClick={onToggleCam}
          title={isCamOff ? 'Включить камеру' : 'Выключить камеру'}
        >
          {isCamOff ? <CamOffIcon /> : <CamIcon />}
          <span>{isCamOff ? 'Включить' : 'Камера'}</span>
        </button>
        <button
          className={`ctrl-chevron ${isCamOff ? 'ctrl-btn--off' : ''} ${open === 'cam' ? 'ctrl-chevron--open' : ''}`}
          onClick={() => toggleOpen('cam')}
          title="Выбрать камеру"
        >
          <ChevronIcon />
        </button>

        {open === 'cam' && (
          <DevicePopover
            label="Камера"
            devices={cameras}
            selectedId={selectedCameraId}
            onSelect={id => { onSwitchCamera(id) }}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      {/* ── Leave ──────────────────────────────────────────────────────── */}
      <button className="ctrl-btn ctrl-btn--leave" onClick={onLeave}>
        <LeaveIcon />
        <span>Выйти</span>
      </button>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}
function CamIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}
function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h3a2 2 0 012 2v9.34" />
      <path d="M16 11.37A4 4 0 1112.63 8L16 11.37z" />
    </svg>
  )
}
function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}
function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  )
}
