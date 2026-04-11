import { Link, useLocation } from 'react-router-dom'
import { BrandLogoLoader } from './BrandLogoLoader'
import type { RoomClosedReason } from '../hooks/useRoom'

export function RoomClosedPage() {
  const location = useLocation()
  const state = (location.state as { roomId?: string; reason?: RoomClosedReason } | null) ?? null
  const roomId = state?.roomId
  const isManagerRequired = state?.reason === 'manager_required'
  const isManagerReconnecting = state?.reason === 'manager_reconnecting'

  return (
    <div className="join-screen room-closed-screen">
      <div className="join-card join-card--room-closed">
        <div className="room-closed-loader-wrap">
          <BrandLogoLoader size={56} />
        </div>
        <h1 className="room-closed-title">
          {isManagerReconnecting
            ? 'Организатор переподключается'
            : isManagerRequired
              ? 'Комната сейчас недоступна'
              : 'Комната закрыта'}
        </h1>
        <p className="room-closed-text">
          {isManagerReconnecting
            ? 'Похоже, у организатора ненадолго пропало соединение. Попробуй зайти ещё раз через минуту, встреча может восстановиться сама.'
            : isManagerRequired
              ? 'Организатор сейчас не в комнате, поэтому вход временно закрыт. Попробуй зайти чуть позже.'
              : 'Внутри сейчас никого нет, и эта ссылка больше не активна. Похоже, встреча уже завершилась.'}
          {roomId ? <span className="room-closed-id">ID: {roomId}</span> : null}
        </p>
        <div className="room-closed-actions">
          <Link to="/" className="join-btn join-btn--block">
            На главную
          </Link>
          <Link to="/" className="join-btn join-btn--secondary join-btn--block">
            {isManagerReconnecting || isManagerRequired ? 'Попробовать снова позже' : 'Открыть новую комнату'}
          </Link>
        </div>
      </div>
    </div>
  )
}
