import { Link, useLocation } from 'react-router-dom'
import { BrandLogoLoader } from './BrandLogoLoader'

export function RoomClosedPage() {
  const location = useLocation()
  const state = (location.state as { roomId?: string; reason?: string } | null) ?? null
  const roomId = state?.roomId
  const isManagerRequired = state?.reason === 'manager_required'

  return (
    <div className="join-screen room-closed-screen">
      <div className="join-card join-card--room-closed">
        <div className="room-closed-loader-wrap">
          <BrandLogoLoader size={56} />
        </div>
        <div className="room-closed-badge" aria-hidden="true">
          <span className="room-closed-badge__emoji">🙂</span>
        </div>
        <h1 className="room-closed-title">
          {isManagerRequired ? 'Комната сейчас недоступна' : 'Комната закрыта'}
        </h1>
        <p className="room-closed-text">
          {isManagerRequired
            ? 'Организатор сейчас не в комнате, поэтому вход временно закрыт. Попробуй зайти чуть позже, извини 🙂'
            : 'Внутри сейчас никого нет, и эта ссылка больше не активна. Извини, похоже встреча уже завершилась 🙂'}
          {roomId ? <span className="room-closed-id">ID: {roomId}</span> : null}
        </p>
        <div className="room-closed-actions">
          <Link to="/" className="join-btn join-btn--block">
            На главную
          </Link>
          <Link to="/" className="join-btn join-btn--secondary join-btn--block">
            {isManagerRequired ? 'Попробовать снова позже' : 'Открыть новую комнату'}
          </Link>
        </div>
      </div>
    </div>
  )
}
