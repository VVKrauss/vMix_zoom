import { useState, useEffect, FormEvent } from 'react'
import type { VideoPreset } from '../types'
import { DEFAULT_VIDEO_PRESET } from '../types'
import { getRoomFromSearch, replaceRoomInBrowserUrl } from '../utils/soloViewerParams'

interface Props {
  onJoin: (name: string, roomId: string, preset: VideoPreset) => void
  error: string | null
}

const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM ?? 'test'

function initialRoomFromUrl(): string {
  return getRoomFromSearch() ?? DEFAULT_ROOM
}

export function JoinPage({ onJoin, error }: Props) {
  const [name, setName] = useState('')
  const [room, setRoom] = useState(initialRoomFromUrl)

  useEffect(() => {
    const trimmed = room.trim()
    if (!trimmed) {
      if (getRoomFromSearch() !== null) {
        const url = new URL(window.location.href)
        url.searchParams.delete('room')
        const qs = url.searchParams.toString()
        window.history.replaceState({}, '', `${url.pathname}${qs ? `?${qs}` : ''}`)
      }
      return
    }
    if (getRoomFromSearch() === trimmed) return
    replaceRoomInBrowserUrl(trimmed)
  }, [room])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onJoin(name.trim(), room.trim() || DEFAULT_ROOM, DEFAULT_VIDEO_PRESET)
  }

  const goMain = () => {
    window.history.replaceState({}, '', window.location.pathname)
    setName('')
    setRoom(DEFAULT_ROOM)
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
