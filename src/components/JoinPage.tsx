import { useState, FormEvent } from 'react'
import type { VideoPreset } from '../types'
import { DEFAULT_VIDEO_PRESET } from '../types'

interface Props {
  onJoin: (name: string, roomId: string, preset: VideoPreset) => void
  error: string | null
}

const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM ?? 'test'

export function JoinPage({ onJoin, error }: Props) {
  const [name, setName] = useState('')
  const [room, setRoom] = useState(DEFAULT_ROOM)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onJoin(name.trim(), room.trim() || DEFAULT_ROOM, DEFAULT_VIDEO_PRESET)
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-logo">
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="redflow.online" />
        </div>

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
            className="join-input"
            type="text"
            placeholder="ID комнаты"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            maxLength={40}
          />

          <button className="join-btn" type="submit" disabled={!name.trim()}>
            Войти
          </button>
        </form>

        {error && <p className="join-error">{error}</p>}
      </div>
    </div>
  )
}
