export type ApiError = {
  status: number
  message: string
  details?: unknown
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

function trimOrigin(s: string): string {
  return String(s ?? '').trim().replace(/\/$/, '')
}

function defaultBase(): string {
  // In dev we may use origin (vite proxy), in prod usually explicit base.
  const raw = trimOrigin(String(import.meta.env.VITE_API_BASE ?? ''))
  const fallback = trimOrigin(String(import.meta.env.VITE_SIGNALING_URL ?? ''))
  return raw || fallback || ''
}

export function apiBaseForPath(path: string): string {
  const p = String(path ?? '')
  // Legacy Supabase gateway lives on signaling host (s.redflow.online):
  // /api/db/* and /api/db/rpc/* should go there even if auth lives on api2/proxy.
  if (p.startsWith('/api/db/')) {
    const dbBase = trimOrigin(String(import.meta.env.VITE_DB_API_BASE ?? ''))
    if (dbBase) return dbBase
    return trimOrigin(String(import.meta.env.VITE_SIGNALING_URL ?? '')) || defaultBase()
  }
  return defaultBase()
}

export function apiBase(): string {
  return apiBaseForPath('/api/health')
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
    const base = apiBaseForPath('/api/auth/refresh')
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
  init?: RequestInit & { auth?: boolean },
): Promise<ApiResult<T>> {
  const base = apiBaseForPath(path)
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`

  const headers = new Headers(init?.headers ?? {})
  headers.set('accept', 'application/json')
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

  if (init?.auth) {
    const token = getAccessToken()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }

  let res: Response
  try {
    res = await fetch(url, { ...init, headers, credentials: 'include' })
  } catch {
    return { ok: false, error: { status: 0, message: 'Сеть или CORS' } }
  }

  // Авто-refresh: один раз при 401 для auth-запросов.
  if (res.status === 401 && init?.auth) {
    const token = await refreshAccessToken()
    if (token) {
      headers.set('authorization', `Bearer ${token}`)
      try {
        res = await fetch(url, { ...init, headers, credentials: 'include' })
      } catch {
        return { ok: false, error: { status: 0, message: 'Сеть или CORS' } }
      }
    }
  }

  const body = await safeReadJson(res)
  if (!res.ok) {
    const message =
      typeof body === 'object' && body
        ? String((body as any).message ?? (body as any).error ?? res.statusText)
        : res.statusText
    return { ok: false, error: { status: res.status, message, details: body } }
  }
  return { ok: true, data: body as T }
}

