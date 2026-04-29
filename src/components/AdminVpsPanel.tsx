import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchJson } from '../api/http'

type VpsStatus = {
  ok: boolean
  now: string
  release: { version: string | null; nodeEnv: string | null }
  db: { ok: boolean; error: string | null; serverVersion: string | null; now: string | null }
  s3: {
    endpoint: string
    region: string
    buckets: { logical: string; bucket: string; ok: boolean; error?: string; sampleKey?: string | null }[]
    note?: string
  }
  vps: {
    memTotalBytes: number
    memFreeBytes: number
    loadAvg: { '1m': number; '5m': number; '15m': number }
    uptimeSec: number
    hostname: string
    platform: string
    arch: string
  }
}

function fmtBytes(n: number): string {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let x = v
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i++
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function AdminVpsPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<VpsStatus | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await fetchJson<VpsStatus>('/api/admin/vps', { method: 'GET', auth: true })
    setLoading(false)
    if (!r.ok) {
      setError(r.error.message)
      setData(null)
      return
    }
    setData(r.data)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pill = useMemo(() => {
    if (loading) return { text: 'проверяю…', cls: 'admin-vps-pill admin-vps-pill--pending' }
    if (error || !data?.ok) return { text: 'ошибка', cls: 'admin-vps-pill admin-vps-pill--bad' }
    const dbOk = data.db.ok
    const s3Ok = data.s3.buckets.every((b) => b.ok)
    return dbOk && s3Ok
      ? { text: 'OK', cls: 'admin-vps-pill admin-vps-pill--ok' }
      : { text: 'частично', cls: 'admin-vps-pill admin-vps-pill--warn' }
  }, [data, error, loading])

  return (
    <div className="admin-vps">
      <div className="admin-vps__head">
        <div className="admin-vps__title-row">
          <strong>Состояние VPS</strong>
          <span className={pill.cls}>{pill.text}</span>
        </div>
        <button type="button" className="join-btn join-btn--secondary" onClick={() => void refresh()} disabled={loading}>
          Обновить
        </button>
      </div>

      {error ? <p className="join-error">{error}</p> : null}

      {data ? (
        <div className="admin-vps__grid">
          <section className="admin-vps-card">
            <div className="admin-vps-card__head">Релиз</div>
            <div className="admin-vps-card__body">
              <div>version: <code className="admin-dashboard-code">{data.release.version ?? 'unknown'}</code></div>
              <div>env: <code className="admin-dashboard-code">{data.release.nodeEnv ?? 'unknown'}</code></div>
              <div>server time: <code className="admin-dashboard-code">{data.now}</code></div>
            </div>
          </section>

          <section className="admin-vps-card">
            <div className="admin-vps-card__head">БД</div>
            <div className="admin-vps-card__body">
              <div>status: <strong>{data.db.ok ? 'OK' : 'FAIL'}</strong></div>
              {data.db.serverVersion ? (
                <div>pg: <code className="admin-dashboard-code">{data.db.serverVersion}</code></div>
              ) : null}
              {data.db.now ? (
                <div>db time: <code className="admin-dashboard-code">{data.db.now}</code></div>
              ) : null}
              {!data.db.ok && data.db.error ? <div className="admin-vps-muted">err: {data.db.error}</div> : null}
            </div>
          </section>

          <section className="admin-vps-card">
            <div className="admin-vps-card__head">S3</div>
            <div className="admin-vps-card__body">
              <div>endpoint: <code className="admin-dashboard-code">{data.s3.endpoint}</code></div>
              <div>region: <code className="admin-dashboard-code">{data.s3.region}</code></div>
              <ul className="admin-vps-list">
                {data.s3.buckets.map((b) => (
                  <li key={b.logical}>
                    <strong>{b.logical}</strong>: {b.ok ? 'OK' : 'FAIL'}{' '}
                    <code className="admin-dashboard-code">{b.bucket}</code>
                    {!b.ok && b.error ? <span className="admin-vps-muted"> — {b.error}</span> : null}
                  </li>
                ))}
              </ul>
              {data.s3.note ? <div className="admin-vps-muted">{data.s3.note}</div> : null}
            </div>
          </section>

          <section className="admin-vps-card admin-vps-card--wide">
            <div className="admin-vps-card__head">VPS</div>
            <div className="admin-vps-card__body">
              <div>
                host: <code className="admin-dashboard-code">{data.vps.hostname}</code> (
                {data.vps.platform}/{data.vps.arch})
              </div>
              <div>
                mem: <code className="admin-dashboard-code">{fmtBytes(data.vps.memFreeBytes)}</code> free /{' '}
                <code className="admin-dashboard-code">{fmtBytes(data.vps.memTotalBytes)}</code> total
              </div>
              <div>
                load: <code className="admin-dashboard-code">{data.vps.loadAvg['1m'].toFixed(2)}</code>{' '}
                <code className="admin-dashboard-code">{data.vps.loadAvg['5m'].toFixed(2)}</code>{' '}
                <code className="admin-dashboard-code">{data.vps.loadAvg['15m'].toFixed(2)}</code>
              </div>
              <div>
                uptime: <code className="admin-dashboard-code">{Math.floor(data.vps.uptimeSec / 60)} min</code>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <AdminDbTablesPanel />
    </div>
  )
}

type DbTablesResponse = { rows: string[] }
type DbTablePreviewResponse = {
  table: string
  columns: { column_name: string; data_type: string }[]
  rows: Record<string, unknown>[]
}

function AdminDbTablesPanel() {
  const [tables, setTables] = useState<string[]>([])
  const [selected, setSelected] = useState<string>('')
  const [preview, setPreview] = useState<DbTablePreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTables = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await fetchJson<DbTablesResponse>('/api/admin/db/tables', { method: 'GET', auth: true })
    setLoading(false)
    if (!r.ok) {
      setError(r.error.message)
      return
    }
    const list = Array.isArray(r.data.rows) ? r.data.rows : []
    setTables(list)
    if (!selected && list[0]) setSelected(list[0])
  }, [selected])

  const loadPreview = useCallback(async (table: string) => {
    const t = table.trim()
    if (!t) return
    setLoading(true)
    setError(null)
    const r = await fetchJson<DbTablePreviewResponse>(`/api/admin/db/tables/${encodeURIComponent(t)}?limit=50&offset=0`, {
      method: 'GET',
      auth: true,
    })
    setLoading(false)
    if (!r.ok) {
      setError(r.error.message)
      setPreview(null)
      return
    }
    setPreview(r.data)
  }, [])

  useEffect(() => {
    void loadTables()
  }, [loadTables])

  useEffect(() => {
    if (selected) void loadPreview(selected)
  }, [selected, loadPreview])

  return (
    <section className="admin-vps-card admin-vps-card--wide">
      <div className="admin-vps-card__head">Таблицы (VPS БД)</div>
      <div className="admin-vps-card__body">
        {error ? <p className="join-error" style={{ marginTop: 0 }}>{error}</p> : null}
        <div className="admin-vps__tables-row">
          <select
            className="join-input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading || tables.length === 0}
          >
            {tables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button type="button" className="join-btn join-btn--secondary" onClick={() => void loadTables()} disabled={loading}>
            Обновить список
          </button>
          <button type="button" className="join-btn join-btn--secondary" onClick={() => void loadPreview(selected)} disabled={loading || !selected}>
            Перезагрузить
          </button>
        </div>

        {preview ? (
          <>
            <div className="admin-vps-muted" style={{ marginTop: 10 }}>
              columns: {preview.columns.map((c) => `${c.column_name}:${c.data_type}`).join(', ')}
            </div>
            <pre className="admin-vps-pre">{JSON.stringify(preview.rows, null, 2)}</pre>
          </>
        ) : null}
      </div>
    </section>
  )
}

