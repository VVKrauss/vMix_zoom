import { FiRrIcon } from '../icons'

type LockBadgeSize = 'list' | 'thread' | 'join' | 'modal'

export function MessengerClosedGcLockBadge({ size = 'list' }: { size?: LockBadgeSize }) {
  return (
    <span
      className={`dashboard-messenger__gc-lock-badge dashboard-messenger__gc-lock-badge--${size}`}
      title="Закрытое сообщество"
      aria-label="Закрытое сообщество"
    >
      <FiRrIcon name="lock" className="dashboard-messenger__gc-lock-badge__ico" />
    </span>
  )
}
