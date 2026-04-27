import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiBase, getAccessToken } from '../api/http'
import { v1AppendConversationMessage, v1EnsureSelfDirectConversation, v1ListConversationMessagesPage } from '../api/messengerApi'
import { realtime } from '../api/realtime'
import { BrandLogoLoader } from './BrandLogoLoader'
import { ChevronLeftIcon } from './icons'

type ProbeStatus = 'idle' | 'running' | 'ok' | 'fail'

type ProbeResult = {
  id: string
  title: string
  status: ProbeStatus
  startedAt?: string
  finishedAt?: string
  details?: any
}

function nowIso() {
  return new Date().toISOString()
}

function safeStringify(x: unknown): string {
  try {
    return JSON.stringify(x, null, 2)
  } catch {
    return String(x)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

async function probeFetch(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; ms: number; bodyText?: string }> {
  const t0 = performance.now()
  try {
    const res = await fetch(url, init)
    const ms = Math.round(performance.now() - t0)
    let bodyText: string | undefined
    try {
      bodyText = await res.text()
    } catch {
      bodyText = undefined
    }
    return { ok: res.ok, status: res.status, ms, bodyText }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    return { ok: false, status: 0, ms, bodyText: e instanceof Error ? e.message : 'fetch_failed' }
  }
}

async function probeWebSocket(
  url: string,
  timeoutMs = 5000,
): Promise<{ ok: boolean; ms: number; opened: boolean; close?: { code: number; reason: string } }> {
  const t0 = performance.now()
  return await new Promise((resolve) => {
    let done = false
    let opened = false
    const ws = new WebSocket(url)
    const timer = window.setTimeout(() => {
      if (done) return
      done = true
      try {
        ws.close()
      } catch {
        /* noop */
      }
      resolve({ ok: false, ms: Math.round(performance.now() - t0), close: { code: 0, reason: 'timeout' }, opened })
    }, timeoutMs)

    ws.onopen = () => {
      if (done) return
      opened = true
      done = true
      window.clearTimeout(timer)
      try {
        ws.close(1000, 'ok')
      } catch {
        /* noop */
      }
      resolve({ ok: true, ms: Math.round(performance.now() - t0), opened: true })
    }
    ws.onerror = () => {
      // wait for close for details
    }
    ws.onclose = (e) => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      resolve({ ok: false, ms: Math.round(performance.now() - t0), close: { code: e.code, reason: e.reason || '' }, opened })
    }
  })
}

function resourceHostsSnapshot(): { total: number; hosts: string[] } {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const hosts = new Set<string>()
    for (const e of entries) {
      const name = typeof e?.name === 'string' ? e.name : ''
      if (!name) continue
      try {
        const u = new URL(name, window.location.href)
        hosts.add(u.host)
      } catch {
        /* noop */
      }
    }
    return { total: entries.length, hosts: Array.from(hosts).sort() }
  } catch {
    return { total: 0, hosts: [] }
  }
}

async function probeHealthSeries(url: string, n = 10): Promise<{ okCount: number; failCount: number; ms: number[]; statuses: number[] }> {
  const ms: number[] = []
  const statuses: number[] = []
  let okCount = 0
  let failCount = 0
  for (let i = 0; i < n; i++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await probeFetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}_${i}`, { method: 'GET', credentials: 'include' })
    ms.push(r.ms)
    statuses.push(r.status)
    if (r.ok) okCount++
    else failCount++
  }
  return { okCount, failCount, ms, statuses }
}

async function probeWebRtcIce(opts: {
  stunUrls: string[]
  turnUrls: string[]
  turnUsername?: string
  turnPassword?: string
  timeoutMs?: number
}): Promise<any> {
  const timeoutMs = Math.max(1000, Math.min(20_000, Math.floor(opts.timeoutMs ?? 10_000)))
  const iceServers: RTCIceServer[] = []
  for (const u of opts.stunUrls) iceServers.push({ urls: u })
  for (const u of opts.turnUrls) {
    if (opts.turnUsername && opts.turnPassword) iceServers.push({ urls: u, username: opts.turnUsername, credential: opts.turnPassword })
    else iceServers.push({ urls: u })
  }

  const t0 = performance.now()
  const pc = new RTCPeerConnection({ iceServers })
  const candidates: string[] = []
  const kinds = new Set<string>()
  let done = false

  function finish(extra?: any) {
    if (done) return
    done = true
    try {
      pc.close()
    } catch {
      /* noop */
    }
    const ms = Math.round(performance.now() - t0)
    return { ok: true, ms, kinds: Array.from(kinds).sort(), candidates: candidates.slice(0, 20), ...extra }
  }

  pc.onicecandidate = (e) => {
    const c = e.candidate
    if (!c) return
    const s = c.candidate || ''
    candidates.push(s)
    // crude parse: typ host/srflx/relay
    const m = /\btyp\s+(host|srflx|relay|prflx)\b/.exec(s)
    if (m?.[1]) kinds.add(m[1])
  }

  const timer = window.setTimeout(() => {
    const res = finish({ timedOut: true })
    // eslint-disable-next-line no-use-before-define
    resolve(res)
  }, timeoutMs)

  let resolve!: (x: any) => void
  const p = new Promise<any>((r) => (resolve = r))

  try {
    // datachannel to kick ICE in most browsers
    pc.createDataChannel('t')
    const offer = await pc.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: false })
    await pc.setLocalDescription(offer)
  } catch (e) {
    window.clearTimeout(timer)
    try {
      pc.close()
    } catch {
      /* noop */
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  pc.onicegatheringstatechange = () => {
    if (pc.iceGatheringState === 'complete') {
      window.clearTimeout(timer)
      resolve(finish({ timedOut: false }))
    }
  }

  return await p
}

function buildReport(results: ProbeResult[]) {
  return {
    at: nowIso(),
    page: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    apiBase: apiBase(),
    signalingUrl: String(import.meta.env.VITE_SIGNALING_URL ?? ''),
    hasAccessToken: Boolean(getAccessToken()),
    resourceHosts: resourceHostsSnapshot(),
    results,
  }
}

function reportFilename(r: { at?: string }) {
  const raw = typeof r?.at === 'string' ? r.at : nowIso()
  // Windows-safe and URL-safe: replace ":" and other separators
  const safe = raw.replace(/[:.]/g, '-')
  return `redflow-test-${safe}.json`
}

export function TestPage() {
  const [items, setItems] = useState<ProbeResult[]>(() => [
    { id: 'chat-send-receive', title: 'Чат: отправить и получить сообщение (самый важный тест)', status: 'idle' },
    { id: 'env', title: 'Окружение (base URLs, токен)', status: 'idle' },
    { id: 'api-health', title: 'HTTPS: GET /api/health', status: 'idle' },
    { id: 'api-health-series', title: 'HTTPS: серия запросов /api/health (флап/тайминги)', status: 'idle' },
    { id: 'wss-api-root', title: 'WSS: api2 / (без токена, диагностика блока по хосту)', status: 'idle' },
    { id: 'wss-no-token', title: 'WSS: /ws без токена (ожидаемо FAIL)', status: 'idle' },
    { id: 'wss-with-token', title: 'WSS: /ws с токеном (ожидаемо OK)', status: 'idle' },
    { id: 'wss-api-random', title: 'WSS: api2 /__ws_probe__ (без токена, диагностика блока по path)', status: 'idle' },
    { id: 'signaling-origin', title: 'HTTPS: signaling origin (reachability)', status: 'idle' },
    { id: 'socketio-signaling', title: 'Socket.IO (signaling): websocket handshake', status: 'idle' },
    { id: 'resources', title: 'Какие хосты реально грузились (Resource Timing)', status: 'idle' },
    { id: 'webrtc-ice', title: 'WebRTC ICE: STUN/TURN кандидаты (host/srflx/relay)', status: 'idle' },
  ])
  const [running, setRunning] = useState(false)

  const signalingUrl = String(import.meta.env.VITE_SIGNALING_URL ?? '').trim().replace(/\/$/, '')
  const turnUrl = String(import.meta.env.VITE_TURN_URL ?? '').trim()
  const turnUsername = String(import.meta.env.VITE_TURN_USERNAME ?? '').trim()
  const turnPassword = String(import.meta.env.VITE_TURN_PASSWORD ?? '').trim()

  const runOne = useCallback(async (id: string) => {
    const startedAt = nowIso()
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'running', startedAt, finishedAt: undefined } : x)))
    const base = apiBase()

    try {
      if (id === 'chat-send-receive') {
        const token = getAccessToken()
        if (!token) throw new Error('not_logged_in (no access token)')

        const ensured = await v1EnsureSelfDirectConversation()
        if (ensured.error || !ensured.data) throw new Error(`ensure_self_dm_failed: ${ensured.error || 'no_conversation_id'}`)
        const conversationId = ensured.data

        const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const body = `test ping ${nonce}`

        const wsT0 = performance.now()
        const ch = `dm-thread:${conversationId}`

        const waitWs = new Promise<{ ok: boolean; ms: number; opened: boolean; match?: any; note?: string }>((resolve) => {
          let done = false
          let opened = false
          let timer: number | null = null
          const channel = realtime.channel(ch)
          const off = channel.on((e) => {
              if (done) return
              if (e.type !== 'db_change') return
              if (e.table !== 'chat_messages' || e.action !== 'INSERT') return
              const row = (e as any).row ?? {}
              const cid = typeof row?.conversation_id === 'string' ? row.conversation_id : ''
              const b = typeof row?.body === 'string' ? row.body : ''
              if (cid !== conversationId) return
              if (b !== body) return
              done = true
              if (timer != null) window.clearTimeout(timer)
              off()
              resolve({
                ok: true,
                ms: Math.round(performance.now() - wsT0),
                opened,
                match: { rowPreview: { id: row?.id, created_at: row?.created_at } },
              })
            })

          channel.subscribe()
          opened = true

          timer = window.setTimeout(() => {
            if (done) return
            done = true
            try {
              off()
            } catch {
              /* noop */
            }
            resolve({ ok: false, ms: Math.round(performance.now() - wsT0), opened, note: 'ws_timeout_waiting_for_db_change' })
          }, 5500)
        })

        const sendT0 = performance.now()
        const sent = await v1AppendConversationMessage({ conversationId, body, kind: 'text' })
        const sendMs = Math.round(performance.now() - sendT0)
        if (sent.error) throw new Error(`send_failed: ${sent.error}`)

        const wsRes = await waitWs

        // Fallback: if WS didn't confirm, check HTTP history quickly (sometimes WS is blocked but HTTP works).
        let httpFound: { ok: boolean; ms: number; found: boolean } | null = null
        if (!wsRes.ok) {
          const httpT0 = performance.now()
          let found = false
          for (let i = 0; i < 6; i++) {
            // eslint-disable-next-line no-await-in-loop
            const page = await v1ListConversationMessagesPage({ conversationId, limit: 20 })
            if (!page.error && page.data?.messages?.some((m: any) => String(m?.body ?? '') === body)) {
              found = true
              break
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(350)
          }
          httpFound = { ok: found, ms: Math.round(performance.now() - httpT0), found }
        }

        const ok = wsRes.ok || httpFound?.found === true
        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: ok ? 'ok' : 'fail',
                  finishedAt: nowIso(),
                  details: {
                    conversationId,
                    channel: ch,
                    sent: { ok: true, ms: sendMs },
                    wsConfirm: wsRes,
                    httpConfirm: httpFound,
                    body,
                    interpretation: wsRes.ok
                      ? 'ok_via_ws'
                      : httpFound?.found
                        ? 'ws_maybe_blocked_but_http_ok'
                        : 'send_ok_but_not_observed_back',
                  },
                }
              : x,
          ),
        )
        return
      }

      if (id === 'env') {
        const token = getAccessToken()
        const details = {
          apiBase: base || '(empty)',
          signalingUrl: signalingUrl || '(empty)',
          accessTokenKey: 'vmix_access_token',
          hasAccessToken: Boolean(token),
          accessTokenPreview: token ? `${token.slice(0, 16)}…${token.slice(-10)}` : null,
        }
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: 'ok', finishedAt: nowIso(), details } : x)),
        )
        return
      }

      if (!base && (id === 'api-health' || id === 'api-cors' || id.startsWith('wss'))) {
        throw new Error('apiBase is empty (VITE_API_BASE/VITE_SIGNALING_URL not set?)')
      }

      if (id === 'api-health') {
        const r = await probeFetch(`${base}/api/health`, { method: 'GET', credentials: 'include' })
        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? { ...x, status: r.ok ? 'ok' : 'fail', finishedAt: nowIso(), details: { ...r, sample: (r.bodyText ?? '').slice(0, 400) } }
              : x,
          ),
        )
        return
      }

      if (id === 'api-health-series') {
        const series = await probeHealthSeries(`${base}/api/health`, 10)
        const ok = series.failCount === 0
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: ok ? 'ok' : 'fail', finishedAt: nowIso(), details: series } : x)),
        )
        return
      }

      if (id === 'wss-api-root') {
        const u = new URL(base)
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
        u.pathname = '/'
        u.search = ''
        const r = await probeWebSocket(u.toString(), 5000)
        // Any "not timeout" close suggests WSS reaches the host; timeout suggests network/DPI block.
        setItems((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, status: r.close?.reason === 'timeout' ? 'fail' : 'ok', finishedAt: nowIso(), details: r } : x,
          ),
        )
        return
      }

      if (id === 'wss-no-token') {
        const u = new URL(base)
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
        u.pathname = '/ws'
        u.search = ''
        const r = await probeWebSocket(u.toString(), 5000)
        // expected to FAIL (server destroys socket without token)
        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? { ...x, status: !r.ok ? 'ok' : 'fail', finishedAt: nowIso(), details: { ...r, expected: 'fail' } }
              : x,
          ),
        )
        return
      }

      if (id === 'wss-with-token') {
        const token = getAccessToken()
        if (!token) throw new Error('no access token in localStorage (vmix_access_token)')
        const u = new URL(base)
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
        u.pathname = '/ws'
        u.search = `?access_token=${encodeURIComponent(token)}`
        const r = await probeWebSocket(u.toString(), 5000)
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: r.ok ? 'ok' : 'fail', finishedAt: nowIso(), details: r } : x)),
        )
        return
      }

      if (id === 'wss-api-random') {
        const u = new URL(base)
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
        u.pathname = '/__ws_probe__'
        u.search = ''
        const r = await probeWebSocket(u.toString(), 5000)
        setItems((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, status: r.close?.reason === 'timeout' ? 'fail' : 'ok', finishedAt: nowIso(), details: r } : x,
          ),
        )
        return
      }

      if (id === 'signaling-origin') {
        if (!signalingUrl) {
          setItems((prev) =>
            prev.map((x) => (x.id === id ? { ...x, status: 'ok', finishedAt: nowIso(), details: { skipped: true } } : x)),
          )
          return
        }
        const r = await probeFetch(`${signalingUrl}/`, { method: 'GET' })
        setItems((prev) =>
          // 200/3xx/4xx all mean "reachable"; only status=0 is network failure.
          prev.map((x) =>
            x.id === id
              ? { ...x, status: r.status === 0 ? 'fail' : 'ok', finishedAt: nowIso(), details: r }
              : x,
          ),
        )
        return
      }

      if (id === 'socketio-signaling') {
        if (!signalingUrl) {
          setItems((prev) =>
            prev.map((x) => (x.id === id ? { ...x, status: 'ok', finishedAt: nowIso(), details: { skipped: true } } : x)),
          )
          return
        }
        const su = new URL(signalingUrl)
        su.protocol = su.protocol === 'https:' ? 'wss:' : 'ws:'
        su.pathname = '/socket.io/'
        // Minimal Socket.IO v4 websocket transport handshake.
        su.search = `?EIO=4&transport=websocket&t=${Date.now()}`
        const r = await probeWebSocket(su.toString(), 6000)
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: r.ok ? 'ok' : 'fail', finishedAt: nowIso(), details: r } : x)),
        )
        return
      }

      if (id === 'resources') {
        const snap = resourceHostsSnapshot()
        const ok = snap.hosts.length > 0
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: ok ? 'ok' : 'fail', finishedAt: nowIso(), details: snap } : x)),
        )
        return
      }

      if (id === 'webrtc-ice') {
        const stunUrls: string[] = []
        // We only test our configured TURN. If TURN is missing, we still run and report only host candidates.
        const turnUrls = turnUrl ? [turnUrl] : []
        const r = await probeWebRtcIce({
          stunUrls,
          turnUrls,
          turnUsername: turnUsername || undefined,
          turnPassword: turnPassword || undefined,
          timeoutMs: 12_000,
        })
        const kinds = Array.isArray(r?.kinds) ? (r.kinds as string[]) : []
        const ok = kinds.includes('srflx') || kinds.includes('relay') || kinds.includes('host')
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, status: ok ? 'ok' : 'fail', finishedAt: nowIso(), details: r } : x)),
        )
        return
      }

      throw new Error(`unknown probe: ${id}`)
    } catch (e) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? { ...x, status: 'fail', finishedAt: nowIso(), details: { error: e instanceof Error ? e.message : String(e) } }
            : x,
        ),
      )
    }
  }, [signalingUrl, turnPassword, turnUrl, turnUsername])

  const runAll = useCallback(async () => {
    if (running) return
    setRunning(true)
    for (const x of items) {
      // eslint-disable-next-line no-await-in-loop
      await runOne(x.id)
    }
    setRunning(false)
  }, [items, runOne, running])

  useEffect(() => {
    // auto-run once (helps non-technical users)
    void runAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const report = useMemo(() => buildReport(items), [items])

  const copyReport = async () => {
    const text = safeStringify(report)
    try {
      await navigator.clipboard.writeText(text)
      alert('Отчёт скопирован в буфер обмена')
    } catch {
      alert(text)
    }
  }

  const downloadReport = () => {
    const text = safeStringify(report)
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = reportFilename(report)
    a.rel = 'noopener'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="join-screen join-screen--themed news-page">
      <div className="news-page__inner">
        <div className="news-page__head">
          <Link to="/" className="news-page__back" title="На главную" aria-label="На главную">
            <ChevronLeftIcon />
          </Link>
          <div className="join-logo-static news-page__logo" aria-hidden>
            <img className="brand-logo brand-logo--join-h" src="/logo-h.png" alt="" draggable={false} />
          </div>
          <span className="news-page__head-slot" aria-hidden />
        </div>

        <h1 className="news-page__title">Тест сети</h1>
        <p className="news-page__empty" style={{ marginBottom: 12 }}>
          Страница помогает понять, что именно блокируется сетью (HTTPS/CORS/WSS).
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="join-btn join-btn--secondary" type="button" disabled={running} onClick={() => void runAll()}>
            {running ? 'Проверяем…' : 'Запустить всё заново'}
          </button>
          <button className="join-btn join-btn--secondary" type="button" disabled={running} onClick={() => void copyReport()}>
            Скопировать отчёт
          </button>
          <button className="join-btn join-btn--secondary" type="button" disabled={running} onClick={() => downloadReport()}>
            Скачать отчёт
          </button>
        </div>

        {running ? (
          <div className="news-page__loading" aria-label="Проверяем…">
            <BrandLogoLoader size={36} />
          </div>
        ) : null}

        <ul className="news-page__list">
          {items.map((x) => (
            <li key={x.id} className="news-page__item">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <h2 className="news-page__item-title" style={{ margin: 0 }}>
                  {x.title}
                </h2>
                <span
                  style={{
                    fontSize: 12,
                    padding: '4px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    color:
                      x.status === 'ok' ? 'var(--text)' : x.status === 'running' ? 'var(--text-dim)' : 'var(--text-dim)',
                    background:
                      x.status === 'ok'
                        ? 'rgba(0, 160, 60, 0.18)'
                        : x.status === 'fail'
                          ? 'rgba(180, 40, 40, 0.18)'
                          : 'rgba(120, 120, 120, 0.12)',
                  }}
                >
                  {x.status}
                </span>
              </div>
              <div className="news-page__item-body" style={{ marginTop: 10 }}>
                <button
                  className="join-btn join-btn--secondary"
                  type="button"
                  disabled={x.status === 'running'}
                  onClick={() => void runOne(x.id)}
                >
                  Запустить
                </button>
              </div>
              {x.details ? (
                <pre
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'rgba(0,0,0,0.25)',
                    overflowX: 'auto',
                    fontSize: 12,
                    lineHeight: 1.35,
                  }}
                >
                  {safeStringify(x.details)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

