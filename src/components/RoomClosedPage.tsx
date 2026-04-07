import { Link, useLocation } from 'react-router-dom'
import { BrandLogoLoader } from './BrandLogoLoader'

export function RoomClosedPage() {
  const location = useLocation()
  const roomId = (location.state as { roomId?: string } | null)?.roomId

  const openHomeNewWindow = () => {
    window.open('/', '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="join-screen room-closed-screen">
      <div className="join-card join-card--room-closed">
        <div className="room-closed-loader-wrap">
          <BrandLogoLoader size={56} />
        </div>
        <h1 className="room-closed-title">Комната закрыта</h1>
        <p className="room-closed-text">
          Хост покинул комнату, и она больше недоступна по этой ссылке.
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
