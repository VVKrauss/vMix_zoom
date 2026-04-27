import { fetchJson, setAccessToken, type ApiResult } from './http'

export type AuthUser = {
  id: string
  email: string | null
  displayName: string | null
  /** Совместимость со старым UI (supabase user_metadata). */
  user_metadata?: Record<string, unknown>
}

export type AuthSession = {
  accessToken: string
  user: AuthUser
}

export async function authGetSession(): Promise<ApiResult<{ session: AuthSession | null }>> {
  return await fetchJson('/api/auth/session', { method: 'GET', auth: true })
}

export async function authSignUp(params: {
  email: string
  password: string
  displayName: string
}): Promise<ApiResult<{ session: AuthSession | null }>> {
  const res = await fetchJson<{ session: AuthSession | null }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  if (res.ok) setAccessToken(res.data.session?.accessToken ?? null)
  return res
}

export async function authSignIn(params: {
  email: string
  password: string
}): Promise<ApiResult<{ session: AuthSession }>> {
  const res = await fetchJson<{ session: AuthSession }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  if (res.ok) setAccessToken(res.data.session.accessToken)
  return res
}

export async function authSignOut(): Promise<void> {
  try {
    await fetchJson('/api/auth/logout', { method: 'POST', auth: true })
  } finally {
    setAccessToken(null)
  }
}

export async function authGetUser(): Promise<ApiResult<{ user: AuthUser | null }>> {
  return await fetchJson('/api/auth/user', { method: 'GET', auth: true })
}

export async function authUpdateProfile(params: {
  displayName?: string | null
  avatarUrl?: string | null
  profileSlug?: string | null
}): Promise<ApiResult<{ user: AuthUser }>> {
  return await fetchJson('/api/auth/profile', { method: 'PATCH', auth: true, body: JSON.stringify(params) })
}

export async function authRequestPasswordReset(params: {
  email: string
  redirectTo: string
}): Promise<ApiResult<{ ok: true; devCode?: string | null }>> {
  return await fetchJson('/api/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function authUpdatePassword(params: { password: string }): Promise<ApiResult<{ ok: true }>> {
  return await fetchJson('/api/auth/password/update', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(params),
  })
}

export async function authConfirmPasswordReset(params: {
  email: string
  code: string
  newPassword: string
}): Promise<ApiResult<{ ok: true }>> {
  return await fetchJson('/api/auth/password/reset/confirm', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

