import { adminAuthHeaders } from '../utils/adminApiAuth'
import { signalingHttpBase } from '../utils/signalingBase'
import type {
  TelegramNotificationsPayload,
  TelegramNotificationsResponse,
} from '../types/telegramAdminSettings'

const PATH = '/api/admin/notifications'
const TEST_PATH = '/api/admin/notifications/test'

function parseTelegram(body: Record<string, unknown>): TelegramNotificationsResponse | null {
  const raw =
    body.telegram && typeof body.telegram === 'object'
      ? (body.telegram as Record<string, unknown>)
      : body
  const configured = Boolean(raw.configured)
  const enabled = Boolean(raw.enabled)
  const immediateEvents = Array.isArray(raw.immediateEvents)
    ? raw.immediateEvents.filter((v): v is TelegramNotificationsResponse['immediateEvents'][number] => typeof v === 'string')
    : []
  const summaryHours = Number(raw.summaryHours)
  if (!Number.isFinite(summaryHours)) return null
  return { configured, enabled, immediateEvents, summaryHours }
}

async function parseError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string; message?: string }
    return j.error || j.message || res.statusText
  } catch {
    return res.statusText
  }
}

export async function fetchTelegramNotifications(): Promise<
  | { ok: true; data: TelegramNotificationsResponse }
  | { ok: false; status: number; message: string }
> {
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}${PATH}`, {
      method: 'GET',
      headers: adminAuthHeaders(false),
    })
    if (!res.ok) {
      return { ok: false, status: res.status, message: await parseError(res) }
    }
    const body = (await res.json()) as Record<string, unknown>
    const data = parseTelegram(body)
    if (!data) {
      return { ok: false, status: 422, message: 'Некорректный ответ сервера' }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, status: 0, message: 'Сеть или CORS' }
  }
}

export async function updateTelegramNotifications(
  payload: TelegramNotificationsPayload,
): Promise<
  | { ok: true; data: TelegramNotificationsResponse }
  | { ok: false; status: number; message: string }
> {
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}${PATH}`, {
      method: 'PUT',
      headers: adminAuthHeaders(true),
      body: JSON.stringify({ telegram: payload }),
    })
    if (!res.ok) {
      return { ok: false, status: res.status, message: await parseError(res) }
    }
    const body = (await res.json()) as Record<string, unknown>
    const data = parseTelegram(body)
    if (!data) {
      return { ok: false, status: 422, message: 'Некорректный ответ сервера' }
    }
    return { ok: true, data }
  } catch {
    return { ok: false, status: 0, message: 'Сеть или CORS' }
  }
}

export async function sendTelegramNotificationsTest(): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string }
> {
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}${TEST_PATH}`, {
      method: 'POST',
      headers: adminAuthHeaders(false),
    })
    if (!res.ok) {
      return { ok: false, status: res.status, message: await parseError(res) }
    }
    return { ok: true }
  } catch {
    return { ok: false, status: 0, message: 'Сеть или CORS' }
  }
}
