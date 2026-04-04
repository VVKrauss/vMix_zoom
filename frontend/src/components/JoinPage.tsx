import { useState, FormEvent } from 'react'

interface Props {
  onJoin: (name: string, roomId: string) => void
  error: string | null
}

const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM ?? 'test'

export function JoinPage({ onJoin, error }: Props) {
  const [name, setName] = useState('')
  const [room, setRoom] = useState(DEFAULT_ROOM)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onJoin(name.trim(), room.trim() || DEFAULT_ROOM)
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-logo">
          <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#e53935" />
            <path d="M8 13h14v14H8V13zm16 3l8-4v16l-8-4V16z" fill="white" />
          </svg>
          <span>vMix Streamer</span>
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
