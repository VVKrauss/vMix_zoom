export type ApiError = {
  status: number
  message: string
  details?: unknown
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export function apiBase(): string {
  // В dev по умолчанию используем origin (vite proxy может прокидывать /api).
  // В prod — явно заданный base.
  const raw = String(import.meta.env.VITE_API_BASE ?? '').trim().replace(/\/$/, '')
  // По умолчанию: тот же origin, что и signaling (например https://api2.redflow.online).
  const fallback = String(import.meta.env.VITE_SIGNALING_URL ?? '').trim().replace(/\/$/, '')
  const picked = raw || fallback
  return picked || ''
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem('vmix_access_token')
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem('vmix_access_token')
    else localStorage.setItem('vmix_access_token', token)
  } catch {
    /* noop */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

async function safeReadJson(res: Response): Promise<unknown | undefined> {
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) return undefined
  try {
    return await res.json()
  } catch {
    return undefined
  }
}

let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    // refresh-token ожидается в httpOnly cookie; поэтому credentials обязательны.
    const base = apiBase()
    const url = `${base}/api/auth/refresh`
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { accept: 'application/json' },
      })
      if (!res.ok) return null
      const body = (await safeReadJson(res)) as any
      const token = typeof body?.accessToken === 'string' ? body.accessToken : null
      setAccessToken(token)
      return token
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit & { auth?: boolean; timeoutMs?: number; retry?: { retries?: number; baseDelayMs?: number } },
): Promise<ApiResult<T>> {
  const base = apiBase()
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`

  const headers = new Headers(init?.headers ?? {})
  headers.set('accept', 'application/json')
  const body = init?.body as any
  const isFormData =
    typeof FormData !== 'undefined' && body && typeof body === 'object' && body instanceof FormData
  // IMPORTANT: for FormData browser must set multipart boundary itself.
  if (init?.body && !isFormData && !headers.has('content-type')) headers.set('content-type', 'application/json')

  if (init?.auth) {
    const token = getAccessToken()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }

  const timeoutMs = init?.timeoutMs != null ? clampInt(init.timeoutMs, 300, 60_000, 12_000) : null
  const retries = clampInt(init?.retry?.retries, 0, 5, 0)
  const baseDelayMs = clampInt(init?.retry?.baseDelayMs, 50, 5_000, 300)

  async function doFetch(): Promise<{ res: Response | null; errorMessage: string | null }> {
    const controller = timeoutMs ? new AbortController() : null
    const timer = timeoutMs ? window.setTimeout(() => controller?.abort(), timeoutMs) : null
    try {
      const res = await fetch(url, { ...init, headers, credentials: 'include', signal: controller?.signal })
      return { res, errorMessage: null }
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'timeout'
          : e instanceof Error
            ? e.message
            : 'fetch_failed'
      return { res: null, errorMessage: msg }
    } finally {
      if (timer != null) window.clearTimeout(timer)
    }
  }

  let res: Response | null = null
  let lastNetworkError: string | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    // eslint-disable-next-line no-await-in-loop
    const r = await doFetch()
    res = r.res
    lastNetworkError = r.errorMessage
    if (res) break
    if (attempt < retries) {
      const delay = baseDelayMs * (attempt + 1)
      // eslint-disable-next-line no-await-in-loop
      await sleep(delay)
    }
  }

  if (!res) {
    return {
      ok: false,
      error: { status: 0, message: lastNetworkError === 'timeout' ? 'Таймаут сети' : 'Сеть или CORS', details: { error: lastNetworkError } },
    }
  }

  // Авто-refresh: один раз при 401 для auth-запросов.
  if (res.status === 401 && init?.auth) {
    const token = await refreshAccessToken()
    if (token) {
      headers.set('authorization', `Bearer ${token}`)
      const r2 = await doFetch()
      if (!r2.res) {
        return {
          ok: false,
          error: { status: 0, message: r2.errorMessage === 'timeout' ? 'Таймаут сети' : 'Сеть или CORS', details: { error: r2.errorMessage } },
        }
      }
      res = r2.res
    }
  }

  const parsed = await safeReadJson(res)
  if (!res.ok) {
    const message =
      typeof parsed === 'object' && parsed
        ? String((parsed as any).message ?? (parsed as any).error ?? res.statusText)
        : res.statusText
    return { ok: false, error: { status: res.status, message, details: parsed } }
  }
  return { ok: true, data: parsed as T }
}

