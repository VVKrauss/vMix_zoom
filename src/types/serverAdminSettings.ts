/** Фрагмент настроек signaling, хранимый на сервере (GET/PUT /api/admin/settings). */
export type ServerSettingsVmixIngress = {
  latencyMs: number
  /** null — без целевого битрейта (на бэке тогда может использоваться maxBitrateKbps). */
  videoBitrateKbps: number | null
  maxBitrateKbps: number | null
  listenPort: number
  useFixedListenPort: boolean
}

export type ServerSettingsPayload = {
  vmixIngress?: ServerSettingsVmixIngress
  signalingUrl?: string | null
}

export type ServerSettingsResponse = {
  vmixIngress: ServerSettingsVmixIngress
  /** Только http/https/ws/wss; null — не задано на сервере. */
  signalingUrl: string | null
  updatedAt?: string
}
