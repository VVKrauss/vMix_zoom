import type { MessengerNetBannerState } from '../../hooks/useNavigatorOnline'

export function MessengerNetStrip(props: { state: MessengerNetBannerState }) {
  const { state } = props
  if (state === 'hidden') return null
  const offline = state === 'offline'
  return (
    <div
      role="status"
      className={`dashboard-messenger__net-strip${
        offline ? ' dashboard-messenger__net-strip--offline' : ' dashboard-messenger__net-strip--online'
      }`}
      aria-label={offline ? 'Нет соединения с интернетом' : 'Соединение восстановлено'}
    >
      {offline ? <span className="dashboard-messenger__net-strip-text">Нет интернета</span> : null}
    </div>
  )
}
