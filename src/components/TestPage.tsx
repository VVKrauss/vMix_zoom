import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiBase, getAccessToken } from '../api/http'
import { v1AppendConversationMessage, v1EnsureSelfDirectConversation, v1ListConversationMessagesPage } from '../api/messengerApi'
import { realtime } from '../api/realtime'
import { subscribeThread } from '../api/messengerRealtime'
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

function isoToMs(s?: string): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? t : null
}

function durationMs(startedAt?: string, finishedAt?: string): number | null {
  const a = isoToMs(startedAt)
  const b = isoToMs(finishedAt)
  if (a == null || b == null) return null
  const d = b - a
  return Number.isFinite(d) && d >= 0 ? d : null
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return ''
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 100) / 10
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = Math.round((s - m * 60) * 10) / 10
  return `${m}m ${rem}s`
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

function newTraceId(): string {
  try {
    // Safari 18 supports randomUUID, but keep safe fallback.
    const v = (globalThis.crypto as any)?.randomUUID?.()
    if (typeof v === 'string' && v) return v
  } catch {
    /* noop */
  }
  return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

async function probeApiRaw(
  path: string,
  init?: RequestInit & { auth?: boolean; timeoutMs?: number },
): Promise<{ ok: boolean; status: number; ms: number; bodyText?: string; error?: string; url?: string }> {
  const base = apiBase()
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const timeoutMs = Math.max(500, Math.min(60_000, Math.floor(init?.timeoutMs ?? 15_000)))

  const headers = new Headers(init?.headers ?? {})
  headers.set('accept', 'application/json')
  const body = init?.body as any
  // For JSON string bodies ensure proper content-type; otherwise Fastify may treat it as plain text.
  if (typeof body === 'string' && body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  if (init?.auth) {
    const token = getAccessToken()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }

  const ac = new AbortController()
  const t0 = performance.now()
  const timer = window.setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, headers, credentials: 'include', signal: ac.signal })
    const ms = Math.round(performance.now() - t0)
    let bodyText: string | undefined
    try {
      bodyText = await res.text()
    } catch {
      bodyText = undefined
    }
    return { ok: res.ok, status: res.status, ms, bodyText, url }
  } catch (e) {
    const ms = Math.round(performance.now() - t0)
    const msg = e instanceof DOMException && e.name === 'AbortError' ? 'timeout' : e instanceof Error ? e.message : 'fetch_failed'
    return { ok: false, status: 0, ms, error: msg, url }
  } finally {
    window.clearTimeout(timer)
  }
}

function safeParseJson(text: string | undefined): any {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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
    { id: 'http-send-raw', title: 'HTTP: raw POST send message (status / network error)', status: 'idle' },
    { id: 'ws-send-ack', title: 'WS: send_message + ack (без нового HTTP)', status: 'idle' },
    { id: 'ws-userfeed', title: 'WS: user feed (bg_message + unread_invalidate)', status: 'idle' },
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
  const [runStartedAt, setRunStartedAt] = useState<string | null>(null)
  const [runFinishedAt, setRunFinishedAt] = useState<string | null>(null)

  const signalingUrl = String(import.meta.env.VITE_SIGNALING_URL ?? '').trim().replace(/\/$/, '')
  const turnUrl = String(import.meta.env.VITE_TURN_URL ?? '').trim()
  const turnUsername = String(import.meta.env.VITE_TURN_USERNAME ?? '').trim()
  const turnPassword = String(import.meta.env.VITE_TURN_PASSWORD ?? '').trim()

  const runOne = useCallback(async (id: string) => {
    const startedAt = nowIso()
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'running', startedAt, finishedAt: undefined } : x)))
    const base = apiBase()

    try {
      if (id === 'http-send-raw') {
        const token = getAccessToken()
        if (!token) throw new Error('not_logged_in (no access token)')

        let conversationId: string | null = null
        const ensured = await v1EnsureSelfDirectConversation()
        if (!ensured.error && ensured.data) conversationId = ensured.data

        // If fetchJson returned a generic network error, try raw and parse the id (this helps in RU where timing is unstable).
        if (!conversationId) {
          const rawSelf = await probeApiRaw('/api/v1/me/conversations/self-direct', {
            method: 'POST',
            auth: true,
            body: JSON.stringify({}),
            timeoutMs: 20_000,
          })
          const parsed = safeParseJson(rawSelf.bodyText)
          const cid = typeof parsed?.conversationId === 'string' ? parsed.conversationId : null
          if (!cid) throw new Error(`ensure_self_dm_failed: ${rawSelf.status || 0} ${rawSelf.error || ''}`.trim())
          conversationId = cid
        }
        if (!conversationId) throw new Error('ensure_self_dm_failed: no_conversation_id')

        const body = `raw test ${Date.now()}`
        const traceId = newTraceId()
        const raw = await probeApiRaw(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
          method: 'POST',
          auth: true,
          headers: { 'x-trace-id': traceId },
          body: JSON.stringify({ body, kind: 'text', meta: null, replyToMessageId: null, quoteToMessageId: null }),
          timeoutMs: 25_000,
        })
        const ok = raw.ok
        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: ok ? 'ok' : 'fail',
                  finishedAt: nowIso(),
                  details: {
                    conversationId,
                    traceId,
                    request: { method: 'POST', path: `/api/v1/conversations/${conversationId}/messages` },
                    response: { ok: raw.ok, status: raw.status, ms: raw.ms, error: raw.error || null, url: raw.url },
                    sample: (raw.bodyText ?? '').slice(0, 800),
                  },
                }
              : x,
          ),
        )
        return
      }

      if (id === 'ws-send-ack') {
        const token = getAccessToken()
        if (!token) throw new Error('not_logged_in (no access token)')

        const ensured = await v1EnsureSelfDirectConversation()
        if (ensured.error || !ensured.data) throw new Error(`ensure_self_dm_failed: ${ensured.error || 'no_conversation_id'}`)
        const conversationId = ensured.data

        // Ensure WS connection attempt (if not already).
        realtime.send({ type: 'ping', at: nowIso() })
        const isOpen = realtime.isOpen()

        const clientId = newTraceId()
        const body = `ws test ${Date.now()}`
        const timeoutMs = 4000
        const t0 = performance.now()

        const ack = await new Promise<any>((resolve) => {
          let done = false
          const off = realtime.onAny((msg) => {
            if (done) return
            if (!msg || typeof msg !== 'object') return
            const t = String((msg as any).type ?? '')
            if (t !== 'message_ack' && t !== 'ack') return
            if (String((msg as any).clientId ?? '') !== clientId) return
            done = true
            window.clearTimeout(timer)
            off()
            resolve(msg)
          })
          const timer = window.setTimeout(() => {
            if (done) return
            done = true
            off()
            resolve({ ok: false, error: { message: 'ws_ack_timeout' } })
          }, timeoutMs)

          realtime.send({
            type: 'send_message',
            conversationId,
            body,
            kind: 'text',
            meta: null,
            replyToMessageId: null,
            quoteToMessageId: null,
            clientId,
            clientAtMs: Date.now(),
          })
        })

        const ms = Math.round(performance.now() - t0)
        const ok = ack?.ok === true
        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: ok ? 'ok' : 'fail',
                  finishedAt: nowIso(),
                  details: {
                    wsWasOpenAtStart: isOpen,
                    timeoutMs,
                    ms,
                    conversationId,
                    clientId,
                    body,
                    ack,
                  },
                }
              : x,
          ),
        )
        return
      }

      if (id === 'ws-userfeed') {
        const token = getAccessToken()
        if (!token) throw new Error('not_logged_in (no access token)')

        const meRaw = await probeApiRaw('/api/v1/me', { method: 'GET', auth: true, timeoutMs: 12_000 })
        const meJson = safeParseJson(meRaw.bodyText)
        const userId =
          (typeof meJson?.id === 'string' ? meJson.id : null) ??
          (typeof meJson?.user?.id === 'string' ? meJson.user.id : null) ??
          (typeof meJson?.data?.id === 'string' ? meJson.data.id : null) ??
          (typeof meJson?.data?.user?.id === 'string' ? meJson.data.user.id : null)
        if (!userId) throw new Error('me_failed: no_user_id')

        const ensured = await v1EnsureSelfDirectConversation()
        if (ensured.error || !ensured.data) throw new Error(`ensure_self_dm_failed: ${ensured.error || 'no_conversation_id'}`)
        const conversationId = ensured.data

        // ensure WS attempt
        realtime.send({ type: 'ping', at: nowIso() })

        const clientId = newTraceId()
        const body = `ws userfeed test ${Date.now()}`
        const timeoutMs = 8000
        const t0 = performance.now()

        const seen: any[] = []
        const ok = await new Promise<boolean>((resolve) => {
          let done = false
          const off = realtime.onAny((msg) => {
            if (done) return
            if (!msg || typeof msg !== 'object') return
            if (String((msg as any).type ?? '') !== 'broadcast') return
            if (String((msg as any).channel ?? '') !== `messenger-user:${userId}`) return
            const ev = String((msg as any).event ?? '')
            if (ev !== 'bg_message' && ev !== 'unread_invalidate' && ev !== 'membership_changed') return
            seen.push({ ev, payload: (msg as any).payload ?? null })
            if (ev === 'bg_message') {
              done = true
              window.clearTimeout(timer)
              off()
              resolve(true)
            }
          })
          const timer = window.setTimeout(() => {
            if (done) return
            done = true
            off()
            resolve(false)
          }, timeoutMs)

          realtime.send({
            type: 'send_message',
            conversationId,
            body,
            kind: 'text',
            meta: null,
            replyToMessageId: null,
            quoteToMessageId: null,
            clientId,
            clientAtMs: Date.now(),
          })
        })

        const ms = Math.round(performance.now() - t0)
        setItems((prev) =>
          prev.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: ok ? 'ok' : 'fail',
                  finishedAt: nowIso(),
                  details: { userId, conversationId, ms, timeoutMs, clientId, seen },
                }
              : x,
          ),
        )
        return
      }

      if (id === 'chat-send-receive') {
        const token = getAccessToken()
        if (!token) throw new Error('not_logged_in (no access token)')

        const steps: any[] = []

        // Step 1: ensure self DM (with retries + detailed network error)
        let conversationId: string | null = null
        {
          const step = { step: 'ensure_self_direct', startedAt: nowIso() }
          let lastErr: any = null
          for (let i = 0; i < 3; i++) {
            // eslint-disable-next-line no-await-in-loop
            const ensured = await v1EnsureSelfDirectConversation()
            if (!ensured.error && ensured.data) {
              conversationId = ensured.data
              lastErr = null
              break
            }
            lastErr = ensured.error || 'no_conversation_id'
            // eslint-disable-next-line no-await-in-loop
            await sleep(250 + i * 250)
          }
          const finishedAt = nowIso()
          steps.push({ ...step, finishedAt, durationMs: durationMs(step.startedAt, finishedAt), ok: Boolean(conversationId), error: lastErr })
        }

        // If ensure failed, probe raw endpoint to distinguish timeout vs CORS vs HTTP error.
        if (!conversationId) {
          const raw = await probeApiRaw('/api/v1/me/conversations/self-direct', { method: 'POST', auth: true, body: JSON.stringify({}), timeoutMs: 20_000 })
          throw new Error(`ensure_self_dm_failed: ${raw.status || 0} ${raw.error || ''}`.trim())
        }

        const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`
        const body = `test ping ${nonce}`

        const wsT0 = performance.now()

        // Step 2: subscribe and wait for typed event message_created for our body
        const waitWs = new Promise<{ ok: boolean; ms: number; match?: any; note?: string }>((resolve) => {
          let done = false
          const off = subscribeThread(conversationId, (ev) => {
            if (done) return
            if (ev.type !== 'message_created') return
            const m = (ev as any).message ?? null
            if (!m || typeof m !== 'object') return
            if (String(m.conversationId ?? '') !== conversationId) return
            if (String(m.body ?? '') !== body) return
            done = true
            window.clearTimeout(timer)
            off()
            resolve({
              ok: true,
              ms: Math.round(performance.now() - wsT0),
              match: { messageId: String(m.id ?? ''), createdAt: String(m.createdAt ?? '') },
            })
          })
          const timer = window.setTimeout(() => {
            if (done) return
            done = true
            off()
            resolve({ ok: false, ms: Math.round(performance.now() - wsT0), note: 'ws_timeout_waiting_for_message_created' })
          }, 15_000)
        })

        // Step 3: send message (HTTP)
        let sendMs = 0
        {
          const step = { step: 'send_message', startedAt: nowIso() }
          const sendT0 = performance.now()
          const sent = await v1AppendConversationMessage({ conversationId, body, kind: 'text' })
          sendMs = Math.round(performance.now() - sendT0)
          const finishedAt = nowIso()
          steps.push({
            ...step,
            finishedAt,
            durationMs: durationMs(step.startedAt, finishedAt),
            ok: !sent.error,
            error: sent.error,
          })
          if (sent.error) {
            const raw = await probeApiRaw(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
              method: 'POST',
              auth: true,
              body: JSON.stringify({ body, kind: 'text', meta: null, replyToMessageId: null, quoteToMessageId: null }),
              timeoutMs: 25_000,
            })
            throw new Error(`send_failed: ${raw.status || 0} ${raw.error || ''}`.trim())
          }
        }

        const wsRes = await waitWs

        // Fallback: if WS didn't confirm, check HTTP history quickly (sometimes WS is blocked but HTTP works).
        let httpFound: { ok: boolean; ms: number; found: boolean } | null = null
        if (!wsRes.ok) {
          const httpT0 = performance.now()
          let found = false
          for (let i = 0; i < 20; i++) {
            // eslint-disable-next-line no-await-in-loop
            const page = await v1ListConversationMessagesPage({ conversationId, limit: 20 })
            if (!page.error && page.data?.messages?.some((m: any) => String(m?.body ?? '') === body)) {
              found = true
              break
            }
            // eslint-disable-next-line no-await-in-loop
            await sleep(500)
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
                    channel: `thread:${conversationId}`,
                    sent: { ok: true, ms: sendMs },
                    wsConfirm: wsRes,
                    httpConfirm: httpFound,
                    body,
                    steps,
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
    setRunStartedAt(nowIso())
    setRunFinishedAt(null)
    for (const x of items) {
      // eslint-disable-next-line no-await-in-loop
      await runOne(x.id)
    }
    setRunFinishedAt(nowIso())
    setRunning(false)
  }, [items, runOne, running])

  useEffect(() => {
    // auto-run once (helps non-technical users)
    void runAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const report = useMemo(() => {
    const base = buildReport(items) as any
    const resultsWithDurations = (Array.isArray(base?.results) ? base.results : []).map((r: ProbeResult) => ({
      ...r,
      durationMs: durationMs(r.startedAt, r.finishedAt),
    }))
    return {
      ...base,
      run: {
        startedAt: runStartedAt,
        finishedAt: runFinishedAt,
        durationMs: durationMs(runStartedAt ?? undefined, runFinishedAt ?? undefined),
      },
      results: resultsWithDurations,
    }
  }, [items, runFinishedAt, runStartedAt])

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
        {runStartedAt ? (
          <p className="news-page__empty" style={{ marginBottom: 12 }}>
            Прогон: {runStartedAt}
            {runFinishedAt ? ` → ${runFinishedAt}` : ''}{' '}
            {runFinishedAt ? `(${formatDuration(durationMs(runStartedAt, runFinishedAt))})` : ''}
          </p>
        ) : null}

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
                <span style={{ fontSize: 12, opacity: 0.8, whiteSpace: 'nowrap' }}>
                  {formatDuration(durationMs(x.startedAt, x.finishedAt))}
                </span>
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

