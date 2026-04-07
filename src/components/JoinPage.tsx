import { useState, FormEvent } from 'react'
import type { JoinRoomMediaOptions } from '../hooks/useRoom'
import type { VideoPreset } from '../types'
import { getStoredVideoPreset } from '../config/roomUiStorage'
import { MicIcon, MicOffIcon, CamIcon, CamOffIcon } from './icons'
import { useAuth } from '../context/AuthContext'

interface Props {
  roomId: string
  onJoin: (name: string, roomId: string, preset: VideoPreset, media: JoinRoomMediaOptions) => void | Promise<void>
  onBackToHome: () => void
  error: string | null
}

export function JoinPage({ roomId, onJoin, onBackToHome, error }: Props) {
  const { user } = useAuth()

  const profileName = user?.user_metadata?.display_name as string | undefined
    ?? user?.email?.split('@')[0]
    ?? ''

  const [guestName, setGuestName] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const isAuthed = !!user
  const name = isAuthed ? profileName : guestName

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const rid = roomId.trim()
    if (!name.trim() || !rid) return
    void onJoin(name.trim(), rid, getStoredVideoPreset(), { enableMic: micOn, enableCam: camOn })
  }

  const goMain = () => {
    setGuestName('')
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
          {isAuthed ? (
            <div className="join-name-authed">
              <span className="join-name-authed__name">{profileName}</span>
            </div>
          ) : (
            <input
              className="join-input"
              type="text"
              placeholder="Введите имя"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              autoFocus
              maxLength={40}
            />
          )}

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
              <span className="join-media-toggle__icon">{micOn ? <MicIcon /> : <MicOffIcon />}</span>
              <span className="join-media-toggle__text">Микрофон</span>
            </button>
            <button
              type="button"
              className={`join-media-toggle${camOn ? ' join-media-toggle--on' : ' join-media-toggle--off'}`}
              aria-pressed={camOn}
              title={camOn ? 'Камера включена — нажмите, чтобы выключить' : 'Камера выключена — нажмите, чтобы включить'}
              onClick={() => setCamOn((v) => !v)}
            >
              <span className="join-media-toggle__icon">{camOn ? <CamIcon /> : <CamOffIcon />}</span>
              <span className="join-media-toggle__text">Камера</span>
            </button>
          </div>

          <button
            className="join-btn join-btn--block"
            type="submit"
            disabled={!name.trim() || !roomId.trim()}
          >
            Войти
          </button>
        </form>

        {error && <p className="join-error">{error}</p>}
      </div>
    </div>
  )
}
