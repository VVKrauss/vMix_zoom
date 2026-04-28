/**
 * База для signaling и REST к тому же хосту, что и страница.
 *
 * - **dev**: пустая строка → запросы на origin Vite; см. `vite.config` proxy на `VITE_SIGNALING_URL`
 *   (иначе с localhost при `CORS_ORIGIN=https://redflow.online` handshake Socket.IO режется).
 * - **production**: полный URL из `VITE_SIGNALING_URL`.
 */
function trimOrigin(s: unknown): string {
  return String(s ?? '').trim().replace(/\/$/, '')
}

/**
 * Единая точка выбора базового URL.
 * Приоритет: VITE_API_FALLBACK → VITE_API_BASE → VITE_SIGNALING_URL.
 *
 * Зачем: когда прямой доступ к основному API режется (DPI), можно прогнать и HTTP, и Socket.IO через proxy VPS.
 */
function pickBase(): string {
  // UI override (личный кабинет): force proxy/direct without probes.
  // Direct explicitly ignores VITE_API_FALLBACK.
  try {
    const mode = globalThis.localStorage?.getItem('rf_api_route_mode')
    if (mode === 'proxy') {
      const forcedProxy = trimOrigin(import.meta.env.VITE_API_FALLBACK) || 'https://proxy.redflow.online'
      return forcedProxy
    }
    if (mode === 'direct') {
      const forcedDirect = trimOrigin(import.meta.env.VITE_API_BASE) || trimOrigin(import.meta.env.VITE_SIGNALING_URL)
      return forcedDirect
    }
  } catch {
    // ignore
  }

  // If API base was already resolved (probe+cache), reuse it for Socket.IO too.
  // This keeps WS in sync with HTTP when fallback is selected automatically.
  try {
    const raw = globalThis.localStorage?.getItem('rf_api_base')
    if (raw) {
      const parsed = JSON.parse(raw) as { base?: unknown } | null
      const cached = trimOrigin((parsed as any)?.base)
      if (cached) return cached
    }
  } catch {
    // ignore
  }

  const primary = trimOrigin(import.meta.env.VITE_API_BASE)
  if (primary) return primary
  return trimOrigin(import.meta.env.VITE_SIGNALING_URL)
}

export function signalingSocketUrl(): string | undefined {
  if (import.meta.env.DEV) return undefined
  const s = pickBase()
  return s || undefined
}

/** Префикс для `fetch` (`''` в dev → относительный `/api/...` через прокси). */
export function signalingHttpBase(): string {
  return signalingSocketUrl() ?? ''
}
