/**
 * База для signaling и REST к тому же хосту, что и страница.
 *
 * - **dev**: пустая строка → запросы на origin Vite; см. `vite.config` proxy на `VITE_SIGNALING_URL`
 *   (иначе с localhost при `CORS_ORIGIN=https://redflow.online` handshake Socket.IO режется).
 * - **production**: полный URL из `VITE_SIGNALING_URL`.
 */
export function signalingSocketUrl(): string | undefined {
  if (import.meta.env.DEV) return undefined
  const s = String(import.meta.env.VITE_SIGNALING_URL ?? '').trim().replace(/\/$/, '')
  return s || undefined
}

/** Префикс для `fetch` (`''` в dev → относительный `/api/...` через прокси). */
export function signalingHttpBase(): string {
  return signalingSocketUrl() ?? ''
}
