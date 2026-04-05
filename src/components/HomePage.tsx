import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { newRoomId } from '../utils/roomId'

export function HomePage() {
  const navigate = useNavigate()
  const [joinId, setJoinId] = useState('')

  const handleCreate = () => {
    navigate(`/r/${encodeURIComponent(newRoomId())}`)
  }

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (!id) return
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  return (
    <div className="join-screen">
      <div className="join-card join-card--home">
        <div className="join-logo-static" aria-hidden>
          <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
        </div>

        <div className="home-actions">
          <button type="button" className="join-btn join-btn--block" onClick={handleCreate}>
            Создать комнату
          </button>

          <form onSubmit={handleJoinSubmit} className="join-form home-join-form">
            <label className="join-label">Войти по ID</label>
            <input
              className="join-input"
              type="text"
              placeholder="ID комнаты"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              autoComplete="off"
              maxLength={200}
            />
            <button className="join-btn join-btn--secondary join-btn--block" type="submit" disabled={!joinId.trim()}>
              Перейти в комнату
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
