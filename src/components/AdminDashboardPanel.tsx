import { useCallback, useEffect, useState } from 'react'
import {
  fetchAdminOverview,
  fetchAdminPeersList,
  fetchAdminRoomsList,
  type AdminOverviewState,
  type AdminPeerRow,
  type AdminRoomRow,
} from '../api/adminStatsApi'
import { hasAdminBearerToken } from '../utils/adminApiAuth'

function formatMetric(n: number | null): string {
  if (n === null) return '—'
  return String(n)
}

export function AdminDashboardPanel() {
  const [state, setState] = useState<AdminOverviewState | null>(null)
  const [loading, setLoading] = useState(true)
  const [peersOpen, setPeersOpen] = useState(false)
  const [peersLoading, setPeersLoading] = useState(false)
  const [peersRows, setPeersRows] = useState<AdminPeerRow[]>([])
  const [peersErr, setPeersErr] = useState<string | null>(null)
  const [roomsOpen, setRoomsOpen] = useState(false)
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsRows, setRoomsRows] = useState<AdminRoomRow[]>([])
  const [roomsErr, setRoomsErr] = useState<string | null>(null)

  const loadPeers = useCallback(async () => {
    setPeersLoading(true)
    setPeersErr(null)
    const r = await fetchAdminPeersList()
    setPeersLoading(false)
    if (r.ok) {
      setPeersRows(r.peers)
    } else {
      setPeersRows([])
      setPeersErr(
        r.status === 404
          ? 'На signaling нет маршрута GET /api/admin/peers — добавьте его рядом со stats.'
          : r.message,
      )
    }
  }, [])

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true)
    setRoomsErr(null)
    const r = await fetchAdminRoomsList()
    setRoomsLoading(false)
    if (r.ok) {
      setRoomsRows(r.rooms)
    } else {
      setRoomsRows([])
      setRoomsErr(
        r.status === 404
          ? 'На signaling нет маршрута GET /api/admin/rooms — добавьте его рядом со stats.'
          : r.message,
      )
    }
  }, [])

  const loadOverviewOnly = useCallback(async () => {
    setLoading(true)
    setState(await fetchAdminOverview())
    setLoading(false)
  }, [])

  const refreshAll = useCallback(async () => {
    await loadOverviewOnly()
    if (peersOpen) await loadPeers()
    if (roomsOpen) await loadRooms()
  }, [loadOverviewOnly, loadPeers, loadRooms, peersOpen, roomsOpen])

  useEffect(() => {
    void loadOverviewOnly()
  }, [loadOverviewOnly])

  const togglePeersPanel = () => {
    setPeersOpen((open) => {
      const next = !open
      if (next) void loadPeers()
      return next
    })
  }

  const toggleRoomsPanel = () => {
    setRoomsOpen((open) => {
      const next = !open
      if (next) void loadRooms()
      return next
    })
  }

  const serverLabel =
    state === null
      ? '…'
      : state.kind === 'error'
        ? state.serverReachable
          ? 'Ошибка API'
          : 'Недоступен'
        : 'Доступен'

  const online =
    state && state.kind !== 'error' ? formatMetric(state.stats.onlineCount) : loading ? '…' : '—'
  const rooms =
    state && state.kind !== 'error' ? formatMetric(state.stats.activeRooms) : loading ? '…' : '—'

  const canExpand = hasAdminBearerToken()
  const expandDisabled = !canExpand || state?.kind === 'error'
  const detailTitle = !canExpand
    ? 'Нужен VITE_ADMIN_API_SECRET'
    : state?.kind === 'error'
      ? 'Сначала восстановите связь с сервером'
      : undefined

  return (
    <section className="dashboard-section admin-dashboard-section">
      <h2 className="dashboard-section__subtitle">Дашборд</h2>
      <p className="dashboard-section__hint">
        Счётчики — <code className="admin-dashboard-code">GET /api/admin/stats</code>, списки —{' '}
        <code className="admin-dashboard-code">GET /api/admin/peers</code> и{' '}
        <code className="admin-dashboard-code">GET /api/admin/rooms</code> (Bearer).
      </p>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Состояние сервера</span>
          <span
            className={`admin-stat-card__value${state?.kind === 'error' && !state.serverReachable ? ' admin-stat-card__value--warn' : ''}${state?.kind !== 'error' ? ' admin-stat-card__value--ok' : ''}`}
          >
            {loading ? '…' : serverLabel}
          </span>
        </div>
        <button
          type="button"
          className={`admin-stat-card admin-stat-card--interactive${peersOpen ? ' admin-stat-card--panel-open' : ''}`}
          onClick={togglePeersPanel}
          disabled={expandDisabled}
          aria-expanded={peersOpen}
          title={
            detailTitle ??
            (peersOpen ? 'Скрыть список онлайн' : 'Показать, кто сейчас онлайн')
          }
        >
          <span className="admin-stat-card__label">Сейчас онлайн</span>
          <span className="admin-stat-card__value admin-stat-card__value--num">{online}</span>
          <span className="admin-stat-card__chevron">{peersOpen ? '▼ Скрыть список' : '▶ Кто онлайн'}</span>
        </button>
        <button
          type="button"
          className={`admin-stat-card admin-stat-card--interactive${roomsOpen ? ' admin-stat-card--panel-open' : ''}`}
          onClick={toggleRoomsPanel}
          disabled={expandDisabled}
          aria-expanded={roomsOpen}
          title={
            detailTitle ??
            (roomsOpen ? 'Скрыть список комнат' : 'Показать комнаты и хостов')
          }
        >
          <span className="admin-stat-card__label">Активных комнат</span>
          <span className="admin-stat-card__value admin-stat-card__value--num">{rooms}</span>
          <span className="admin-stat-card__chevron">{roomsOpen ? '▼ Скрыть список' : '▶ Список комнат'}</span>
        </button>
      </div>

      {peersOpen ? (
        <div className="admin-rooms-panel" role="region" aria-label="Сейчас онлайн">
          <div className="admin-rooms-panel__head">Подключённые участники</div>
          <div className="admin-rooms-panel__body">
            {peersLoading ? (
              <p>Загрузка…</p>
            ) : peersErr ? (
              <p className="join-error" style={{ margin: 0 }}>
                {peersErr}
              </p>
            ) : peersRows.length === 0 ? (
              <p style={{ margin: 0 }}>Никого нет в списке (или ответ сервера пуст).</p>
            ) : (
              <table className="admin-rooms-table">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>ID сокета</th>
                    <th>Комната</th>
                  </tr>
                </thead>
                <tbody>
                  {peersRows.map((row) => (
                    <tr key={row.peerId}>
                      <td className="admin-rooms-table__host">{row.name ?? '—'}</td>
                      <td className="admin-rooms-table__room">{row.peerId}</td>
                      <td className="admin-rooms-table__host">{row.roomId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {roomsOpen ? (
        <div className="admin-rooms-panel" role="region" aria-label="Активные комнаты">
          <div className="admin-rooms-panel__head">Комнаты и хост</div>
          <div className="admin-rooms-panel__body">
            {roomsLoading ? (
              <p>Загрузка…</p>
            ) : roomsErr ? (
              <p className="join-error" style={{ margin: 0 }}>
                {roomsErr}
              </p>
            ) : roomsRows.length === 0 ? (
              <p style={{ margin: 0 }}>Сейчас нет активных комнат (или список пуст в ответе сервера).</p>
            ) : (
              <table className="admin-rooms-table">
                <thead>
                  <tr>
                    <th>Комната</th>
                    <th>Хост</th>
                    <th>Участников</th>
                  </tr>
                </thead>
                <tbody>
                  {roomsRows.map((row) => (
                    <tr key={row.roomId}>
                      <td className="admin-rooms-table__room">{row.roomId}</td>
                      <td className="admin-rooms-table__host">
                        {row.hostName ?? '—'}
                        {row.hostPeerId ? (
                          <span className="admin-rooms-table__meta" title={row.hostPeerId}>
                            id: {row.hostPeerId}
                          </span>
                        ) : null}
                      </td>
                      <td>{row.peerCount !== null ? String(row.peerCount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      {state?.kind === 'error' ? (
        <p className="join-error admin-dashboard-flash">{state.message}</p>
      ) : null}
      {state?.kind === 'degraded' && state.hint ? (
        <p className="dashboard-section__hint admin-dashboard-hint">{state.hint}</p>
      ) : null}

      <button type="button" className="join-btn admin-dashboard-refresh" onClick={() => void refreshAll()} disabled={loading}>
        {loading ? 'Обновление…' : 'Обновить'}
      </button>
    </section>
  )
}
