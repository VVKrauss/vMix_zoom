/**
 * Ключи localStorage — кэш последних vmixIngress с сервера (и офлайн-фолбэк).
 * signalingUrl на сервере, в LS не дублируем.
 */
import type { ServerSettingsVmixIngress } from '../types/serverAdminSettings'

export const LS_VMIX_INGRESS_LATENCY_MS = 'vmix_server_ingress_latency_ms'
export const LS_VMIX_INGRESS_BITRATE_KBPS = 'vmix_server_ingress_bitrate_kbps'
export const LS_VMIX_INGRESS_MAX_BITRATE_KBPS = 'vmix_server_ingress_max_bitrate_kbps'
export const LS_VMIX_INGRESS_FIXED_PORT = 'vmix_server_ingress_fixed_port'
export const LS_VMIX_INGRESS_LISTEN_PORT = 'vmix_server_ingress_listen_port'

const DEFAULT_LATENCY = 200
const DEFAULT_BITRATE = 4500
const DEFAULT_LISTEN_PORT = 9000

/** Совпадает с типичными VMIX_INGRESS_CLIENT_* на бэке (см. docs/SERVER_SETTINGS_PLAN.md). */
export const VMIX_CLIENT_LATENCY_MIN_MS = 20
export const VMIX_CLIENT_LATENCY_MAX_MS = 5000
export const VMIX_CLIENT_BITRATE_MIN_KBPS = 50
export const VMIX_CLIENT_BITRATE_MAX_KBPS = 20_000

function clampBitrateNullable(n: number | null): number | null {
  if (n === null) return null
  return Math.min(
    VMIX_CLIENT_BITRATE_MAX_KBPS,
    Math.max(VMIX_CLIENT_BITRATE_MIN_KBPS, Math.round(Number(n))),
  )
}

export function clampVmixIngressUiState(s: ServerSettingsVmixIngress): ServerSettingsVmixIngress {
  return {
    latencyMs: Math.min(
      VMIX_CLIENT_LATENCY_MAX_MS,
      Math.max(VMIX_CLIENT_LATENCY_MIN_MS, Math.round(Number(s.latencyMs)) || DEFAULT_LATENCY),
    ),
    videoBitrateKbps: clampBitrateNullable(
      s.videoBitrateKbps === null || s.videoBitrateKbps === undefined ? null : Number(s.videoBitrateKbps),
    ),
    maxBitrateKbps: clampBitrateNullable(
      s.maxBitrateKbps === null || s.maxBitrateKbps === undefined ? null : Number(s.maxBitrateKbps),
    ),
    useFixedListenPort: Boolean(s.useFixedListenPort),
    listenPort: Math.min(65535, Math.max(1024, Math.round(Number(s.listenPort)) || DEFAULT_LISTEN_PORT)),
  }
}

function readNullableBitrateKey(
  key: string,
  whenMissing: number | null,
): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === 'null') return null
    if (raw === null || raw === '') {
      return whenMissing
    }
    const n = Number(raw)
    return Number.isFinite(n) ? n : whenMissing
  } catch {
    return whenMissing
  }
}

export function readLocalVmixIngressUiState(): ServerSettingsVmixIngress {
  try {
    const latRaw = localStorage.getItem(LS_VMIX_INGRESS_LATENCY_MS)
    const lat = latRaw != null ? Number(latRaw) : DEFAULT_LATENCY
    const hadVideoKey = localStorage.getItem(LS_VMIX_INGRESS_BITRATE_KBPS) !== null
    const videoBitrateKbps = readNullableBitrateKey(
      LS_VMIX_INGRESS_BITRATE_KBPS,
      hadVideoKey ? null : DEFAULT_BITRATE,
    )
    const maxBitrateKbps = readNullableBitrateKey(LS_VMIX_INGRESS_MAX_BITRATE_KBPS, null)
    const fixed = localStorage.getItem(LS_VMIX_INGRESS_FIXED_PORT) === '1'
    const portRaw = localStorage.getItem(LS_VMIX_INGRESS_LISTEN_PORT)
    const port = portRaw != null ? Number(portRaw) : DEFAULT_LISTEN_PORT
    return clampVmixIngressUiState({
      latencyMs: lat,
      videoBitrateKbps,
      maxBitrateKbps,
      useFixedListenPort: fixed,
      listenPort: port,
    })
  } catch {
    return clampVmixIngressUiState({
      latencyMs: DEFAULT_LATENCY,
      videoBitrateKbps: DEFAULT_BITRATE,
      maxBitrateKbps: null,
      useFixedListenPort: false,
      listenPort: DEFAULT_LISTEN_PORT,
    })
  }
}

export function writeLocalVmixIngressUiState(s: ServerSettingsVmixIngress): void {
  const c = clampVmixIngressUiState(s)
  try {
    localStorage.setItem(LS_VMIX_INGRESS_LATENCY_MS, String(c.latencyMs))
    localStorage.setItem(
      LS_VMIX_INGRESS_BITRATE_KBPS,
      c.videoBitrateKbps === null ? 'null' : String(c.videoBitrateKbps),
    )
    localStorage.setItem(
      LS_VMIX_INGRESS_MAX_BITRATE_KBPS,
      c.maxBitrateKbps === null ? 'null' : String(c.maxBitrateKbps),
    )
    localStorage.setItem(LS_VMIX_INGRESS_FIXED_PORT, c.useFixedListenPort ? '1' : '0')
    localStorage.setItem(LS_VMIX_INGRESS_LISTEN_PORT, String(c.listenPort))
  } catch { /* noop */ }
}

/** Поля для Socket.IO startVmixIngress (из локального кэша vmixIngress). */
export function readVmixIngressEmitExtras(): {
  latencyMs?: number
  videoBitrateKbps?: number
  maxBitrateKbps?: number
  listenPort?: number
} {
  const c = readLocalVmixIngressUiState()
  const out: {
    latencyMs?: number
    videoBitrateKbps?: number
    maxBitrateKbps?: number
    listenPort?: number
  } = { latencyMs: c.latencyMs }
  if (c.videoBitrateKbps != null) {
    out.videoBitrateKbps = c.videoBitrateKbps
  } else if (c.maxBitrateKbps != null) {
    out.maxBitrateKbps = c.maxBitrateKbps
  }
  if (c.useFixedListenPort) {
    out.listenPort = c.listenPort
  }
  return out
}
