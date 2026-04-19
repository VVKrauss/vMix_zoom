import type { MessengerNetBannerState } from '../../hooks/useNavigatorOnline'

export function MessengerNetStrip(props: { state: MessengerNetBannerState }) {
  const { state } = props
  if (state === 'hidden') return null
  return (
    <div
      role="status"
      className={`dashboard-messenger__net-strip${
        state === 'offline' ? ' dashboard-messenger__net-strip--offline' : ' dashboard-messenger__net-strip--online'
      }`}
      aria-label={state === 'offline' ? 'Нет соединения с интернетом' : 'Соединение восстановлено'}
    />
  )
}
