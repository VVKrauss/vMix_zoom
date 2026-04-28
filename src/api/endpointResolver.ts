const CACHE_KEY = 'rf_api_base'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const ROUTE_MODE_KEY = 'rf_api_route_mode' // 'proxy' | 'direct'

const PROBE_PATH = '/api/health'
const PROBE_TIMEOUT_MS = 3000

function trimOrigin(s: string): string {
  return String(s ?? '').trim().replace(/\/$/, '')
}

function nowMs(): number {
  return Date.now()
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* noop */
  }
}

function safeLocalStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

type Cached = { base: string; ts: number }

function readRouteMode(): 'proxy' | 'direct' | null {
  const v = safeLocalStorageGet(ROUTE_MODE_KEY)
  return v === 'proxy' || v === 'direct' ? v : null
}

function loadCache(): string | null {
  const raw = safeLocalStorageGet(CACHE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Cached>
    const base = typeof parsed?.base === 'string' ? parsed.base : ''
    const ts = typeof parsed?.ts === 'number' ? parsed.ts : 0
    if (!base || !Number.isFinite(ts) || ts <= 0) return null
    if (nowMs() - ts > CACHE_TTL_MS) {
      safeLocalStorageRemove(CACHE_KEY)
      return null
    }
    return base
  } catch {
    return null
  }
}

function saveCache(base: string): void {
  safeLocalStorageSet(CACHE_KEY, JSON.stringify({ base, ts: nowMs() } satisfies Cached))
}

async function probe(base: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${base}${PROBE_PATH}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'include',
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

function envPrimaryApi(): string {
  const raw = trimOrigin(String(import.meta.env.VITE_API_BASE ?? ''))
  if (raw) return raw
  // Backward-compat: if API base is not configured, use signaling URL (old setups).
  return trimOrigin(String(import.meta.env.VITE_SIGNALING_URL ?? ''))
}

function envFallbackApi(): string {
  return trimOrigin(String(import.meta.env.VITE_API_FALLBACK ?? ''))
}

let inFlight: Promise<string> | null = null

export function getCachedApiBase(): string {
  // UI override (личный кабинет): force proxy/direct without probes and without relying on cache.
  const mode = readRouteMode()
  if (mode === 'proxy') return envFallbackApi() || envPrimaryApi()
  if (mode === 'direct') return envPrimaryApi()

  // If fallback is configured at build time, always prefer it (DPI-safe default).
  const fallback = envFallbackApi()
  if (fallback) return fallback

  return loadCache() ?? envPrimaryApi()
}

export function resetApiBaseCache(): void {
  inFlight = null
  safeLocalStorageRemove(CACHE_KEY)
}

/**
 * Decide whether to use primary API or fallback proxy.
 * - If localStorage has a fresh decision → returns it.
 * - Otherwise probes PRIMARY with a short timeout and falls back to proxy on failure.
 */
export async function resolveApiBase(): Promise<string> {
  // UI override (личный кабинет): force proxy/direct without probes and without relying on cache.
  const mode = readRouteMode()
  if (mode === 'proxy') {
    const picked = envFallbackApi() || envPrimaryApi()
    if (picked) saveCache(picked)
    return picked
  }
  if (mode === 'direct') {
    const picked = envPrimaryApi()
    if (picked) saveCache(picked)
    return picked
  }

  // If fallback is configured at build time, always prefer it (DPI-safe default).
  const forcedFallback = envFallbackApi()
  if (forcedFallback) {
    saveCache(forcedFallback)
    return forcedFallback
  }

  const cached = loadCache()
  if (cached) return cached

  if (inFlight) return inFlight
  inFlight = (async () => {
    const primary = envPrimaryApi()
    const fallback = envFallbackApi()

    // No fallback configured → keep primary.
    if (!fallback || !primary || fallback === primary) {
      if (primary) saveCache(primary)
      return primary
    }

    const ok = await probe(primary)
    const picked = ok ? primary : fallback
    saveCache(picked)
    return picked
  })()

  return inFlight
}

