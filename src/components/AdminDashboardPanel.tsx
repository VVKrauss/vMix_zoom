import { useCallback, useEffect, useState } from 'react'
import { fetchAdminOverview, type AdminOverviewState } from '../api/adminStatsApi'

function formatMetric(n: number | null): string {
  if (n === null) return '—'
  return String(n)
}

export function AdminDashboardPanel() {
  const [state, setState] = useState<AdminOverviewState | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setState(await fetchAdminOverview())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

  return (
    <section className="dashboard-section admin-dashboard-section">
      <h2 className="dashboard-section__subtitle">Дашборд</h2>
      <p className="dashboard-section__hint">
        Состояние signaling и нагрузка. Счётчики приходят с маршрута{' '}
        <code className="admin-dashboard-code">GET /api/admin/stats</code> (Bearer).
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
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Сейчас онлайн</span>
          <span className="admin-stat-card__value admin-stat-card__value--num">{online}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Активных комнат</span>
          <span className="admin-stat-card__value admin-stat-card__value--num">{rooms}</span>
        </div>
      </div>

      {state?.kind === 'error' ? (
        <p className="join-error admin-dashboard-flash">{state.message}</p>
      ) : null}
      {state?.kind === 'degraded' && state.hint ? (
        <p className="dashboard-section__hint admin-dashboard-hint">{state.hint}</p>
      ) : null}

      <button type="button" className="join-btn admin-dashboard-refresh" onClick={() => void load()} disabled={loading}>
        {loading ? 'Обновление…' : 'Обновить'}
      </button>
    </section>
  )
}
