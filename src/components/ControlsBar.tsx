import { useEffect, useRef, useState } from 'react'
import { DevicePopover } from './DevicePopover'
import type { VideoPreset } from '../types'
import { VIDEO_PRESETS } from '../types'
import type { LayoutMode, ObjectFit } from './RoomPage'

interface Props {
  isMuted: boolean
  isCamOff: boolean
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  selectedCameraId: string
  selectedMicId: string
  onToggleMute: () => void
  onToggleCam: () => void
  onLeave: () => void
  onSwitchCamera: (deviceId: string) => void
  onSwitchMic: (deviceId: string) => void
  activePreset: VideoPreset
  onChangePreset: (p: VideoPreset) => void
  objectFit: ObjectFit
  onObjectFitToggle: () => void
  layout: LayoutMode
  showMeter: boolean
  onToggleMeter: () => void
  showInfo: boolean
  onToggleInfo: () => void
  onResetView: () => void
}

type OpenPopover = 'mic' | 'cam' | 'settings' | null

export function ControlsBar({
  isMuted, isCamOff,
  cameras, microphones, selectedCameraId, selectedMicId,
  onToggleMute, onToggleCam, onLeave,
  onSwitchCamera, onSwitchMic,
  activePreset, onChangePreset,
  objectFit, onObjectFitToggle, layout,
  showMeter, onToggleMeter,
  showInfo, onToggleInfo,
  onResetView,
}: Props) {
  const [open, setOpen] = useState<OpenPopover>(null)

  const toggleOpen = (which: OpenPopover) =>
    setOpen(prev => prev === which ? null : which)

  const handleLeave = () => {
    if (window.confirm('Вы уверены, что хотите выйти?')) onLeave()
  }

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

      {/* ── Settings ───────────────────────────────────────────────────── */}
      <div className="ctrl-group ctrl-group--solo">
        <button
          className={`ctrl-btn ${open === 'settings' ? 'ctrl-btn--active' : ''}`}
          onClick={() => toggleOpen('settings')}
          title="Настройки"
        >
          <GearIcon />
          <span>Настройки</span>
        </button>

        {open === 'settings' && (
          <SettingsPopover
            activePreset={activePreset}
            onChangePreset={onChangePreset}
            objectFit={objectFit}
            onObjectFitToggle={onObjectFitToggle}
            layout={layout}
            showMeter={showMeter}
            onToggleMeter={onToggleMeter}
            showInfo={showInfo}
            onToggleInfo={onToggleInfo}
            onResetView={() => { onResetView(); setOpen(null) }}
            onClose={() => setOpen(null)}
          />
        )}
      </div>

      {/* ── Leave ──────────────────────────────────────────────────────── */}
      <button className="ctrl-btn ctrl-btn--leave" onClick={handleLeave}>
        <LeaveIcon />
        <span>Выйти</span>
      </button>
    </div>
  )
}

// ─── Settings popover ────────────────────────────────────────────────────────

function SettingsPopover({
  activePreset, onChangePreset,
  objectFit, onObjectFitToggle, layout,
  showMeter, onToggleMeter,
  showInfo, onToggleInfo,
  onResetView, onClose,
}: {
  activePreset: VideoPreset
  onChangePreset: (p: VideoPreset) => void
  objectFit: ObjectFit
  onObjectFitToggle: () => void
  layout: LayoutMode
  showMeter: boolean
  onToggleMeter: () => void
  showInfo: boolean
  onToggleInfo: () => void
  onResetView: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover__title">Настройки</div>

      {/* Quality */}
      <div className="settings-row">
        <span className="settings-label">Качество видео</span>
        <select
          className="settings-select"
          value={VIDEO_PRESETS.indexOf(activePreset)}
          onChange={(e) => onChangePreset(VIDEO_PRESETS[Number(e.target.value)])}
        >
          {VIDEO_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Object-fit (only in grid) */}
      {layout === 'grid' && (
        <button className="settings-row settings-row--btn" onClick={onObjectFitToggle}>
          <span className="settings-label">Масштаб видео</span>
          <span className="settings-value">{objectFit === 'contain' ? 'Полный' : 'Заполнить'}</span>
        </button>
      )}

      {/* Audio meter toggle */}
      <button className="settings-row settings-row--btn" onClick={onToggleMeter}>
        <span className="settings-label">Аудиометр</span>
        <span className={`settings-toggle ${showMeter ? 'settings-toggle--on' : ''}`}>
          {showMeter ? 'Вкл' : 'Выкл'}
        </span>
      </button>

      {/* Info toggle */}
      <button className="settings-row settings-row--btn" onClick={onToggleInfo}>
        <span className="settings-label">Инфо</span>
        <span className={`settings-toggle ${showInfo ? 'settings-toggle--on' : ''}`}>
          {showInfo ? 'Вкл' : 'Выкл'}
        </span>
      </button>

      {/* Reset */}
      <button className="settings-row settings-row--btn settings-row--reset" onClick={onResetView}>
        <span className="settings-label">Сбросить вид</span>
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
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ transform: 'rotate(180deg)' }}>
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  )
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.68 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}
