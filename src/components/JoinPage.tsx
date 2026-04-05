import { useState, FormEvent } from 'react'
import type { VideoPreset } from '../types'
import { DEFAULT_VIDEO_PRESET } from '../types'

interface Props {
  roomId: string
  onJoin: (name: string, roomId: string, preset: VideoPreset) => void
  onBackToHome: () => void
  error: string | null
}

export function JoinPage({ roomId, onJoin, onBackToHome, error }: Props) {
  const [name, setName] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const rid = roomId.trim()
    if (name.trim() && rid) onJoin(name.trim(), rid, DEFAULT_VIDEO_PRESET)
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

          <button className="join-btn" type="submit" disabled={!name.trim() || !roomId.trim()}>
            Войти
          </button>
        </form>

        {error && <p className="join-error">{error}</p>}
      </div>
    </div>
  )
}
