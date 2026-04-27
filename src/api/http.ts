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
  init?: RequestInit & { auth?: boolean },
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

