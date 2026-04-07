import { adminAuthHeaders, hasAdminBearerToken } from '../utils/adminApiAuth'
import { signalingHttpBase } from '../utils/signalingBase'

const STATS_PATH = '/api/admin/stats'
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

/** Ответ signaling: GET /api/admin/stats (Bearer). Допускаются snake_case поля. */
export type AdminServerStatsPayload = {
  onlineCount: number | null
  activeRooms: number | null
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

function parseStatsBody(body: Record<string, unknown>): AdminServerStatsPayload {
  const onlineCount = pickFiniteInt(
    body.onlineCount ?? body.online_count ?? body.peers ?? body.connectedClients ?? body.connected_clients ?? body.sockets,
  )
  const activeRooms = pickFiniteInt(
    body.activeRooms ?? body.active_rooms ?? body.roomCount ?? body.room_count ?? body.rooms,
  )
  return { onlineCount, activeRooms }
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
            stats: { onlineCount: null, activeRooms: null },
            statsEndpointMissing: true,
            hint: `На signaling нет маршрута ${STATS_PATH}. Добавьте его или расширьте ответ JSON полями onlineCount и activeRooms.`,
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
      stats: { onlineCount: null, activeRooms: null },
      statsEndpointMissing: true,
      hint: 'Задайте VITE_ADMIN_API_SECRET и реализуйте GET /api/admin/stats на signaling, чтобы видеть онлайн и комнаты.',
    }
  }
  return {
    kind: 'error',
    serverReachable: false,
    message: 'Не удалось достучаться до signaling (проверьте VITE_SIGNALING_URL и прокси).',
  }
}
