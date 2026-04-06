import type {
  ServerSettingsPayload,
  ServerSettingsResponse,
  ServerSettingsVmixIngress,
} from '../types/serverAdminSettings'
import { adminAuthHeaders } from '../utils/adminApiAuth'
import { signalingHttpBase } from '../utils/signalingBase'

const PATH = '/api/admin/settings'

function parseNullableFinite(n: unknown): number | null {
  if (n === null || n === undefined) return null
  if (typeof n === 'string' && n.trim() === '') return null
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

function getVmixRecord(body: Record<string, unknown>): Record<string, unknown> | null {
  const top = body.vmixIngress ?? body.vmix_ingress
  if (!top || typeof top !== 'object') return null
  const t = top as Record<string, unknown>
  const nest = t.vmix_ingress
  if (nest && typeof nest === 'object') {
    return { ...(nest as Record<string, unknown>), ...t }
  }
  return t
}

function extractVmix(body: Record<string, unknown>): ServerSettingsResponse['vmixIngress'] | null {
  const v = getVmixRecord(body)
  if (!v) return null
  const latencyMs = Number(v.latencyMs ?? v.latency_ms)
  const listenPort = Number(v.listenPort ?? v.listen_port)
  const videoBitrateKbps = parseNullableFinite(v.videoBitrateKbps ?? v.video_bitrate_kbps)
  const maxBitrateKbps = parseNullableFinite(v.maxBitrateKbps ?? v.max_bitrate_kbps)
  const useFixedListenPort = Boolean(
    v.useFixedListenPort ?? v.use_fixed_listen_port ?? v.fixedListenPort ?? v.fixed_listen_port,
  )
  if (!Number.isFinite(latencyMs) || !Number.isFinite(listenPort)) {
    return null
  }
  return { latencyMs, videoBitrateKbps, maxBitrateKbps, listenPort, useFixedListenPort }
}

function extractSignalingUrl(body: Record<string, unknown>): string | null {
  const raw = body.signalingUrl ?? body.signaling_url
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return null
  return raw
}

export async function fetchServerSettings(): Promise<
  | { ok: true; data: ServerSettingsResponse }
  | { ok: false; status: number; message: string }
> {
  const base = signalingHttpBase()
  try {
    const res = await fetch(`${base}${PATH}`, {
      method: 'GET',
      headers: adminAuthHeaders(false),
    })
    if (!res.ok) {
      let message = res.statusText
      try {
        const j = (await res.json()) as { message?: string; error?: string }
        message = j.error || j.message || message
      } catch { /* noop */ }
      return { ok: false, status: res.status, message }
    }
    const body = (await res.json()) as Record<string, unknown>
    const vmixIngress = extractVmix(body)
    if (!vmixIngress) {
      return { ok: false, status: 422, message: 'Ответ сервера без блока vmixIngress' }
    }
    const signalingUrl = extractSignalingUrl(body)
    const updatedAt =
      typeof body.updatedAt === 'string'
        ? body.updatedAt
        : typeof body.updated_at === 'string'
          ? body.updated_at
          : undefined
    return { ok: true, data: { vmixIngress, signalingUrl, updatedAt } }
  } catch {
    return { ok: false, status: 0, message: 'Сеть или CORS' }
  }
}

function buildVmixJson(v: ServerSettingsVmixIngress): Record<string, unknown> {
  return {
    latencyMs: v.latencyMs,
    videoBitrateKbps: v.videoBitrateKbps,
    maxBitrateKbps: v.maxBitrateKbps,
    listenPort: v.listenPort,
    useFixedListenPort: v.useFixedListenPort,
  }
}

export async function putServerSettings(
  payload: ServerSettingsPayload,
): Promise<
  | { ok: true; data: ServerSettingsResponse }
  | { ok: false; status: number; message: string }
> {
  const base = signalingHttpBase()
  try {
    const body: Record<string, unknown> = {}
    if (payload.vmixIngress) {
      body.vmixIngress = buildVmixJson(payload.vmixIngress)
    }
    if ('signalingUrl' in payload) {
      body.signalingUrl = payload.signalingUrl
    }
    const res = await fetch(`${base}${PATH}`, {
      method: 'PUT',
      headers: adminAuthHeaders(true),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let message = res.statusText
      try {
        const j = (await res.json()) as { message?: string; error?: string }
        message = j.error || j.message || message
      } catch { /* noop */ }
      return { ok: false, status: res.status, message }
    }
    const resBody = (await res.json()) as Record<string, unknown>
    const vmixIngress = extractVmix(resBody) ?? payload.vmixIngress
    if (!vmixIngress) {
      return { ok: false, status: 422, message: 'Ответ сервера без блока vmixIngress' }
    }
    const hasSignalingInRes = 'signalingUrl' in resBody || 'signaling_url' in resBody
    const signalingUrl = hasSignalingInRes
      ? extractSignalingUrl(resBody)
      : payload.signalingUrl !== undefined
        ? (payload.signalingUrl ?? null)
        : null
    const updatedAt =
      typeof resBody.updatedAt === 'string'
        ? resBody.updatedAt
        : typeof resBody.updated_at === 'string'
          ? resBody.updated_at
          : undefined
    return { ok: true, data: { vmixIngress, signalingUrl, updatedAt } }
  } catch {
    return { ok: false, status: 0, message: 'Сеть или CORS' }
  }
}
