import { useState, FormEvent } from 'react'

interface Props {
  onJoin: (displayName: string) => void
}

export function JoinForm({ onJoin }: Props) {
  const [name, setName] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onJoin(trimmed)
  }

  return (
    <div className="join-screen">
      <div className="join-card">
        <div className="join-logo">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="#e53935" />
            <path d="M8 13h14v14H8V13zm16 3l8-4v16l-8-4V16z" fill="white" />
          </svg>
          <span>vMix Streamer</span>
        </div>
        <p className="join-subtitle">Войдите в комнату. Ваш поток появится в vMix.</p>
        <form onSubmit={handleSubmit} className="join-form">
          <input
            type="text"
            className="join-input"
            placeholder="Ваше имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={40}
          />
          <button type="submit" className="join-btn" disabled={!name.trim()}>
            Войти
          </button>
        </form>
      </div>
    </div>
  )
}
