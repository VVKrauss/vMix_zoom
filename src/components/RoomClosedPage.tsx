import { Link, useLocation } from 'react-router-dom'
import { BrandLogoLoader } from './BrandLogoLoader'

export function RoomClosedPage() {
  const location = useLocation()
  const state = (location.state as { roomId?: string; reason?: string } | null) ?? null
  const roomId = state?.roomId
  const reason = state?.reason === 'manager_required' ? 'manager_required' : 'room_closed'

  const openHomeNewWindow = () => {
    window.open('/', '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="join-screen room-closed-screen">
      <div className="join-card join-card--room-closed">
        <div className="room-closed-loader-wrap">
          <BrandLogoLoader size={56} />
        </div>
        <h1 className="room-closed-title">
          {reason === 'manager_required' ? 'Комната сейчас недоступна' : 'Комната закрыта'}
        </h1>
        <p className="room-closed-text">
          {reason === 'manager_required'
            ? 'Организатор сейчас не в комнате, поэтому вход временно закрыт. Извини 🙂'
            : 'Внутри сейчас никого нет, и эта ссылка больше не активна. Извини 🙂'}
          {roomId ? (
            <>
              {' '}
              <span className="room-closed-id">ID: {roomId}</span>
            </>
          ) : null}
        </p>
        <div className="room-closed-actions">
          <Link to="/" className="join-btn join-btn--block">
            На главную
          </Link>
          <button type="button" className="join-btn join-btn--secondary join-btn--block" onClick={openHomeNewWindow}>
            Главная в новом окне
          </button>
        </div>
      </div>
    </div>
  )
}
