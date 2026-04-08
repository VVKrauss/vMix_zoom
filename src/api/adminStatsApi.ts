import { adminAuthHeaders, hasAdminBearerToken } from '../utils/adminApiAuth'
import { signalingHttpBase } from '../utils/signalingBase'

const STATS_PATH = '/api/admin/stats'
const ROOMS_PATH = '/api/admin/rooms'
const PEERS_PATH = '/api/admin/peers'
const SETTINGS_PATH = '/api/admin/settings'

async function adminSettingsReachable(): Promise<boolean> {
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}${SETTINGS_PATH}`, {
      method: 'GET',
      headers: adminAuthHeaders(false),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Метрики хоста signaling (опционально в том же JSON, что и счётчики). */
export type AdminHostMetrics = {
  cpuPercent: number | null
  memoryUsedMb: number | null
  memoryTotalMb: number | null
  uptimeSec: number | null
  loadAvg1m: number | null
  nodeVersion: string | null
}

const EMPTY_HOST_METRICS: AdminHostMetrics = {
  cpuPercent: null,
  memoryUsedMb: null,
  memoryTotalMb: null,
  uptimeSec: null,
  loadAvg1m: null,
  nodeVersion: null,
}

/** Ответ signaling: GET /api/admin/stats (Bearer). Допускаются snake_case поля. */
export type AdminServerStatsPayload = {
  onlineCount: number | null
  activeRooms: number | null
  host: AdminHostMetrics
}

export type AdminOverviewState =
  | {
      kind: 'ok'
      serverReachable: true
      stats: AdminServerStatsPayload
      statsEndpointMissing: boolean
      hint?: string
    }
  | {
      kind: 'degraded'
      serverReachable: true
      stats: AdminServerStatsPayload
      statsEndpointMissing: true
      hint: string
    }
  | {
      kind: 'error'
      serverReachable: boolean
      message: string
    }

function pickFiniteInt(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

function pickFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

function pickVersionStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s || null
}

function parseHostMetrics(body: Record<string, unknown>): AdminHostMetrics {
  const src =
    body.host && typeof body.host === 'object' && !Array.isArray(body.host)
      ? (body.host as Record<string, unknown>)
      : body

  const cpuPercent = pickFiniteNumber(
    src.cpuPercent ?? src.cpu_percent ?? src.cpu ?? src.cpuLoad ?? src.cpu_load,
  )
  const memoryUsedMb = pickFiniteNumber(
    src.memoryUsedMb ??
      src.memory_used_mb ??
      src.memUsedMb ??
      src.mem_used_mb ??
      src.rssMb ??
      src.rss_mb,
  )
  const memoryTotalMb = pickFiniteNumber(
    src.memoryTotalMb ??
      src.memory_total_mb ??
      src.memTotalMb ??
      src.mem_total_mb ??
      src.totalMemMb ??
      src.total_mem_mb,
  )
  const uptimeSec = pickFiniteNumber(
    src.uptimeSec ?? src.uptime_sec ?? src.uptime ?? src.uptimeSeconds,
  )
  const loadAvg1m = pickFiniteNumber(
    src.loadAvg1m ?? src.load_avg_1m ?? src.load1 ?? src.loadavg1,
  )
  const nodeVersion = pickVersionStr(src.nodeVersion ?? src.node_version ?? src.node)

  const allNull =
    cpuPercent == null &&
    memoryUsedMb == null &&
    memoryTotalMb == null &&
    uptimeSec == null &&
    loadAvg1m == null &&
    nodeVersion == null

  if (allNull) return { ...EMPTY_HOST_METRICS }

  return {
    cpuPercent,
    memoryUsedMb,
    memoryTotalMb,
    uptimeSec,
    loadAvg1m,
    nodeVersion,
  }
}

function parseStatsBody(body: Record<string, unknown>): AdminServerStatsPayload {
  const onlineCount = pickFiniteInt(
    body.onlineCount ?? body.online_count ?? body.peers ?? body.connectedClients ?? body.connected_clients ?? body.sockets,
  )
  const activeRooms = pickFiniteInt(
    body.activeRooms ?? body.active_rooms ?? body.roomCount ?? body.room_count ?? body.rooms,
  )
  const host = parseHostMetrics(body)
  return { onlineCount, activeRooms, host }
}

async function probeSocketIoPolling(): Promise<boolean> {
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}/socket.io/?EIO=4&transport=polling&t=${Date.now()}`)
    if (!res.ok) return false
    const text = await res.text()
    return text.startsWith('0')
  } catch {
    return false
  }
}

/**
 * Сводка для админ-дашборда: статистика с /api/admin/stats при наличии Bearer,
 * иначе или при 404 — проверка доступности signaling.
 */
export async function fetchAdminOverview(): Promise<AdminOverviewState> {
  const base = signalingHttpBase()
  const token = hasAdminBearerToken()

  if (token) {
    try {
      const res = await fetch(`${base}${STATS_PATH}`, {
        method: 'GET',
        headers: adminAuthHeaders(false),
      })
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>
        const stats = parseStatsBody(body)
        return {
          kind: 'ok',
          serverReachable: true,
          stats,
          statsEndpointMissing: false,
        }
      }
      if (res.status === 404) {
        const settingsOk = await adminSettingsReachable()
        if (settingsOk) {
          return {
            kind: 'degraded',
            serverReachable: true,
            stats: { onlineCount: null, activeRooms: null, host: { ...EMPTY_HOST_METRICS } },
            statsEndpointMissing: true,
            hint: `На signaling нет маршрута ${STATS_PATH}. Добавьте его или расширьте ответ JSON полями onlineCount, activeRooms и опционально host (cpuPercent, memoryUsedMb, memoryTotalMb, uptimeSec, …).`,
          }
        }
        return {
          kind: 'error',
          serverReachable: false,
          message: 'Не удалось проверить сервер (admin/settings недоступен или неверный Bearer).',
        }
      }
      let message = res.statusText
      try {
        const j = (await res.json()) as { message?: string; error?: string }
        message = j.error || j.message || message
      } catch {
        /* noop */
      }
      return { kind: 'error', serverReachable: true, message: message || `HTTP ${res.status}` }
    } catch {
      return { kind: 'error', serverReachable: false, message: 'Сеть или CORS' }
    }
  }

  const pollingOk = await probeSocketIoPolling()
  if (pollingOk) {
    return {
      kind: 'degraded',
      serverReachable: true,
      stats: { onlineCount: null, activeRooms: null, host: { ...EMPTY_HOST_METRICS } },
      statsEndpointMissing: true,
      hint: 'Задайте VITE_ADMIN_API_SECRET и реализуйте GET /api/admin/stats на signaling, чтобы видеть онлайн, комнаты и опционально метрики хоста.',
    }
  }
  return {
    kind: 'error',
    serverReachable: false,
    message: 'Не удалось достучаться до signaling (проверьте VITE_SIGNALING_URL и прокси).',
  }
}

/** Строка списка комнат: GET /api/admin/rooms (Bearer). */
export type AdminRoomRow = {
  roomId: string
  hostName: string | null
  hostPeerId: string | null
  peerCount: number | null
}

function pickStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() || null
  return null
}

function parseRoomEntry(raw: unknown): AdminRoomRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const roomId = pickStr(o.roomId ?? o.room_id ?? o.id ?? o.slug)
  if (!roomId) return null
  const hostObj = o.host
  let hostName = pickStr(o.hostName ?? o.host_name ?? o.hostDisplayName ?? o.host_display_name)
  let hostPeerId = pickStr(o.hostPeerId ?? o.host_peer_id ?? o.hostId ?? o.host_id)
  if (!hostName && hostObj && typeof hostObj === 'object') {
    const h = hostObj as Record<string, unknown>
    hostName = pickStr(h.name ?? h.displayName ?? h.display_name)
    hostPeerId = hostPeerId ?? pickStr(h.peerId ?? h.peer_id ?? h.id)
  }
  const peerCount = pickFiniteInt(o.peerCount ?? o.peer_count ?? o.participants ?? o.clientsInRoom)
  return { roomId, hostName, hostPeerId, peerCount }
}

function parseRoomsBody(body: Record<string, unknown>): AdminRoomRow[] {
  const raw =
    body.rooms ??
    body.activeRooms ??
    body.active_rooms ??
    body.data ??
    body.list
  if (!Array.isArray(raw)) return []
  const out: AdminRoomRow[] = []
  for (const item of raw) {
    const row = parseRoomEntry(item)
    if (row) out.push(row)
  }
  return out
}

/**
 * Список активных комнат и хост: GET /api/admin/rooms (тот же Bearer, что и stats).
 * Ответ: `{ rooms: [ { roomId, hostName?, hostPeerId?, peerCount? } ] }` (допускается snake_case).
 */
export async function fetchAdminRoomsList(): Promise<
  | { ok: true; rooms: AdminRoomRow[] }
  | { ok: false; status: number; message: string }
> {
  if (!hasAdminBearerToken()) {
    return { ok: false, status: 0, message: 'Нет VITE_ADMIN_API_SECRET в сборке.' }
  }
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}${ROOMS_PATH}`, {
      method: 'GET',
      headers: adminAuthHeaders(false),
    })
    if (!res.ok) {
      let message = res.statusText
      try {
        const j = (await res.json()) as { message?: string; error?: string }
        message = j.error || j.message || message
      } catch {
        /* noop */
      }
      return { ok: false, status: res.status, message: message || `HTTP ${res.status}` }
    }
    const body = (await res.json()) as Record<string, unknown>
    return { ok: true, rooms: parseRoomsBody(body) }
  } catch {
    return { ok: false, status: 0, message: 'Сеть или CORS' }
  }
}

/** Строка списка онлайн-участников: GET /api/admin/peers (Bearer). */
export type AdminPeerRow = {
  peerId: string
  name: string | null
  roomId: string | null
}

function parsePeerEntry(raw: unknown): AdminPeerRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const peerId = pickStr(
    o.peerId ?? o.peer_id ?? o.socketId ?? o.socket_id ?? o.id ?? o.clientId ?? o.client_id,
  )
  if (!peerId) return null
  const name = pickStr(o.name ?? o.displayName ?? o.display_name ?? o.userName ?? o.user_name)
  const roomId = pickStr(o.roomId ?? o.room_id ?? o.room ?? o.roomSlug ?? o.room_slug)
  return { peerId, name, roomId }
}

function parsePeersBody(body: Record<string, unknown>): AdminPeerRow[] {
  const raw =
    body.peers ??
    body.online ??
    body.clients ??
    body.sockets ??
    body.participants ??
    body.data ??
    body.list
  if (!Array.isArray(raw)) return []
  const out: AdminPeerRow[] = []
  for (const item of raw) {
    const row = parsePeerEntry(item)
    if (row) out.push(row)
  }
  return out
}

/**
 * Кто сейчас подключён: GET /api/admin/peers (тот же Bearer).
 * Ответ: `{ peers: [ { peerId, name?, roomId? } ] }` (допускается snake_case и поля socketId / room).
 */
export async function fetchAdminPeersList(): Promise<
  | { ok: true; peers: AdminPeerRow[] }
  | { ok: false; status: number; message: string }
> {
  if (!hasAdminBearerToken()) {
    return { ok: false, status: 0, message: 'Нет VITE_ADMIN_API_SECRET в сборке.' }
  }
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}${PEERS_PATH}`, {
      method: 'GET',
      headers: adminAuthHeaders(false),
    })
    if (!res.ok) {
      let message = res.statusText
      try {
        const j = (await res.json()) as { message?: string; error?: string }
        message = j.error || j.message || message
      } catch {
        /* noop */
      }
      return { ok: false, status: res.status, message: message || `HTTP ${res.status}` }
    }
    const body = (await res.json()) as Record<string, unknown>
    return { ok: true, peers: parsePeersBody(body) }
  } catch {
    return { ok: false, status: 0, message: 'Сеть или CORS' }
  }
}
