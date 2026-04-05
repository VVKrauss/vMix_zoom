import { useState, FormEvent } from 'react'
import type { JoinRoomMediaOptions } from '../hooks/useRoom'
import type { VideoPreset } from '../types'
import { DEFAULT_VIDEO_PRESET } from '../types'

interface Props {
  roomId: string
  onJoin: (name: string, roomId: string, preset: VideoPreset, media: JoinRoomMediaOptions) => void
  onBackToHome: () => void
  error: string | null
}

function MicOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  )
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8" />
    </svg>
  )
}

function CamOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3m3-3h6l2 3h3a2 2 0 012 2v9.34" />
      <path d="M16 11.37A4 4 0 1112.63 8L16 11.37z" />
    </svg>
  )
}

export function JoinPage({ roomId, onJoin, onBackToHome, error }: Props) {
  const [name, setName] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const rid = roomId.trim()
    if (!name.trim() || !rid) return
    onJoin(name.trim(), rid, DEFAULT_VIDEO_PRESET, { enableMic: micOn, enableCam: camOn })
  }

  const goMain = () => {
    setName('')
    onBackToHome()
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <button type="button" className="join-logo-btn" onClick={goMain} title="Главная" aria-label="Главная">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </button>

        <form onSubmit={handleSubmit} className="join-form">
          <label className="join-label">Ваше имя</label>
          <input
            className="join-input"
            type="text"
            placeholder="Введите имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={40}
          />

          <label className="join-label">Комната</label>
          <input
            className="join-input join-input--readonly"
            type="text"
            readOnly
            value={roomId}
            title={roomId}
            aria-readonly="true"
          />

          <label className="join-label" id="join-media-label">
            Микрофон и камера
          </label>
          <div
            className="join-media-toggles"
            role="group"
            aria-labelledby="join-media-label"
          >
            <button
              type="button"
              className={`join-media-toggle${micOn ? ' join-media-toggle--on' : ' join-media-toggle--off'}`}
              aria-pressed={micOn}
              title={micOn ? 'Микрофон включён — нажмите, чтобы выключить' : 'Микрофон выключен — нажмите, чтобы включить'}
              onClick={() => setMicOn((v) => !v)}
            >
              <span className="join-media-toggle__icon">{micOn ? <MicOnIcon /> : <MicOffIcon />}</span>
              <span className="join-media-toggle__text">Микрофон</span>
            </button>
            <button
              type="button"
              className={`join-media-toggle${camOn ? ' join-media-toggle--on' : ' join-media-toggle--off'}`}
              aria-pressed={camOn}
              title={camOn ? 'Камера включена — нажмите, чтобы выключить' : 'Камера выключена — нажмите, чтобы включить'}
              onClick={() => setCamOn((v) => !v)}
            >
              <span className="join-media-toggle__icon">{camOn ? <CamOnIcon /> : <CamOffIcon />}</span>
              <span className="join-media-toggle__text">Камера</span>
            </button>
          </div>

          <button className="join-btn join-btn--block" type="submit" disabled={!name.trim() || !roomId.trim()}>
            Войти
          </button>
        </form>

        {error && <p className="join-error">{error}</p>}
      </div>
    </div>
  )
}
