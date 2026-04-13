import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BrandLogoLoader } from './BrandLogoLoader'
import type { RoomClosedReason } from '../hooks/useRoom'
import { ChevronLeftIcon } from './icons'

export function RoomClosedPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state =
    (location.state as {
      roomId?: string
      reason?: RoomClosedReason | 'invite_expired' | 'banned'
    } | null) ?? null
  const roomId = state?.roomId
  const reason = state?.reason

  const isManagerRequired = reason === 'manager_required'
  const isManagerReconnecting = reason === 'manager_reconnecting'
  const isInviteExpired = reason === 'invite_expired'
  const isKicked = reason === 'kicked'
  const isBanned = reason === 'banned'

  const title = isBanned
    ? 'Вас заблокировали'
    : isKicked
      ? 'Вы удалены из комнаты'
      : isInviteExpired
        ? 'Срок приглашения истёк'
        : isManagerReconnecting
          ? 'Организатор переподключается'
          : isManagerRequired
            ? 'Комната сейчас недоступна'
            : 'Комната закрыта'

  const body = isBanned
    ? 'Организатор заблокировал вас в этой комнате. Вы не можете войти снова. Если это ошибка — свяжитесь с организатором.'
    : isKicked
      ? 'Организатор удалил вас из комнаты. Попробуйте связаться с ним, если хотите вернуться.'
      : isInviteExpired
        ? 'Для этой временной комнаты окно бесплатного входа по ссылке уже закрыто. Попроси организатора или администратора пустить тебя — скоро здесь появится запрос на вход.'
        : isManagerReconnecting
          ? 'Похоже, у организатора ненадолго пропало соединение. Попробуй зайти ещё раз через минуту, встреча может восстановиться сама.'
          : isManagerRequired
            ? 'Организатор сейчас не в комнате, поэтому вход временно закрыт. Попробуй зайти чуть позже.'
            : 'Внутри сейчас никого нет, и эта ссылка больше не активна. Похоже, встреча уже завершилась.'

  const retryLabel =
    isManagerReconnecting || isManagerRequired || isInviteExpired
      ? 'Попробовать снова позже'
      : 'Открыть новую комнату'

  return (
    <div className="join-screen room-closed-screen">
      <div className="join-card join-card--room-closed">
        <div className="join-host-create__head join-host-create__head--room-closed">
          <button
            type="button"
            className="join-back-arrow"
            onClick={() => navigate(-1)}
            title="Назад"
            aria-label="Назад"
          >
            <ChevronLeftIcon />
          </button>
          <span className="join-host-create__head-slot" aria-hidden />
          <span className="join-host-create__head-slot" aria-hidden />
        </div>
        <div className="room-closed-loader-wrap">
          <BrandLogoLoader size={56} />
        </div>
        <h1 className="room-closed-title">{title}</h1>
        <p className="room-closed-text">
          {body}
          {roomId ? <span className="room-closed-id">ID: {roomId}</span> : null}
        </p>
        <div className="room-closed-actions">
          <Link to="/dashboard" className="join-btn join-btn--block">
            Домой
          </Link>
          {!isBanned && !isKicked ? (
            <Link to="/" className="join-btn join-btn--secondary join-btn--block">
              {retryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
