import { getAccessToken, getRefreshToken, setTokens } from './tokens'

function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, '')
}

export function getBackendOrigin(): string {
  const fromEnv = (import.meta.env.VITE_SIGNALING_URL as string | undefined) ?? ''
  const origin = trimOrigin(fromEnv)
  if (origin) return origin
  return ''
}

type ApiError = { error: { code: string; message: string; details?: Record<string, unknown> } }

async function tryRefreshToken(origin: string): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  const res = await fetch(`${origin}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => null)
  if (!res || !res.ok) return false
  const j = (await res.json().catch(() => null)) as { tokens?: { accessToken?: string; refreshToken?: string } } | null
  const accessToken = j?.tokens?.accessToken?.trim() ?? ''
  const nextRefreshToken = j?.tokens?.refreshToken?.trim() ?? ''
  if (!accessToken || !nextRefreshToken) return false
  setTokens({ accessToken, refreshToken: nextRefreshToken })
  return true
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { skipAuth?: boolean },
): Promise<{ data: T | null; error: string | null; status: number }> {
  const origin = getBackendOrigin()
  if (!origin) return { data: null, error: 'backend_origin_missing', status: 0 }

  const url = path.startsWith('http') ? path : `${origin}${path.startsWith('/') ? '' : '/'}${path}`

  const attempt = async (): Promise<Response> => {
    const headers = new Headers(init?.headers ?? {})
    if (!init?.skipAuth) {
      const token = getAccessToken()
      if (token) headers.set('authorization', `Bearer ${token}`)
    }
    if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
    return fetch(url, { ...init, headers })
  }

  let res: Response
  try {
    res = await attempt()
  } catch {
    return { data: null, error: 'network', status: 0 }
  }

  if (res.status === 401 && !init?.skipAuth) {
    const refreshed = await tryRefreshToken(origin)
    if (refreshed) {
      try {
        res = await attempt()
      } catch {
        return { data: null, error: 'network', status: 0 }
      }
    }
  }

  const status = res.status
  const raw = await res.text().catch(() => '')
  const json = raw ? (JSON.parse(raw) as unknown) : null

  if (!res.ok) {
    const errMsg =
      (json as Partial<ApiError> | null)?.error?.message ||
      (typeof (json as any)?.message === 'string' ? String((json as any).message) : '') ||
      `${status}`
    return { data: null, error: errMsg || 'request_failed', status }
  }

  return { data: (json as T) ?? null, error: null, status }
}

