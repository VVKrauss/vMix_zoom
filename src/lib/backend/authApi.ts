import { apiFetch } from './client'
import { setTokens } from './tokens'

export type BackendGlobalRole = {
  code: string
  title: string | null
  scopeType: string
}

/** Ответ `/me` после миграции 005; старые поля совместимы с коротким объектом. */
export type BackendUser = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  phone?: string | null
  status?: string
  isEmailVerified?: boolean
  isPhoneVerified?: boolean
  lastLoginAt?: string | null
  roomUiPreferences?: unknown | null
  profileSlug?: string | null
  profileSearchClosed?: boolean
  profileSearchAllowByName?: boolean
  profileSearchAllowByEmail?: boolean
  profileSearchAllowBySlug?: boolean
  dmAllowFrom?: string
  profileViewAllowFrom?: string
  profileShowAvatar?: boolean
  profileShowSlug?: boolean
  profileShowLastActive?: boolean
  profileShowOnline?: boolean
  profileDmReceiptsPrivate?: boolean
  messengerPinnedConversationIds?: unknown | null
  lastActiveAt?: string | null
  presenceLastBackgroundAt?: string | null
  globalRoles?: BackendGlobalRole[]
}

export type PatchMePayload = {
  displayName?: string
  profileSlug?: string | null
  profileSearchClosed?: boolean
  profileSearchAllowByName?: boolean
  profileSearchAllowByEmail?: boolean
  profileSearchAllowBySlug?: boolean
  dmAllowFrom?: 'everyone' | 'contacts_only'
  profileViewAllowFrom?: 'everyone' | 'contacts_only'
  profileShowAvatar?: boolean
  profileShowSlug?: boolean
  profileShowLastActive?: boolean
  profileShowOnline?: boolean
  profileDmReceiptsPrivate?: boolean
  roomUiPreferences?: unknown
  avatarUrl?: string | null
}

export async function backendSignUp(
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: BackendUser | null; error: string | null }> {
  const res = await apiFetch<{ user: BackendUser; tokens: { accessToken: string; refreshToken: string } }>(
    '/auth/register',
    { method: 'POST', skipAuth: true, body: JSON.stringify({ email, password, displayName }) },
  )
  if (res.error || !res.data) return { user: null, error: res.error ?? 'signup_failed' }
  setTokens({ accessToken: res.data.tokens.accessToken, refreshToken: res.data.tokens.refreshToken })
  return { user: res.data.user, error: null }
}

export async function backendSignIn(
  email: string,
  password: string,
): Promise<{ user: BackendUser | null; error: string | null }> {
  const res = await apiFetch<{ user: BackendUser; tokens: { accessToken: string; refreshToken: string } }>(
    '/auth/login',
    { method: 'POST', skipAuth: true, body: JSON.stringify({ email, password }) },
  )
  if (res.error || !res.data) return { user: null, error: res.error ?? 'login_failed' }
  setTokens({ accessToken: res.data.tokens.accessToken, refreshToken: res.data.tokens.refreshToken })
  return { user: res.data.user, error: null }
}

export async function backendSignOut(): Promise<void> {
  const refreshToken = (() => {
    try {
      return localStorage.getItem('redflow-refresh-token') ?? ''
    } catch {
      return ''
    }
  })()
  if (refreshToken) {
    void apiFetch('/auth/logout', { method: 'POST', skipAuth: true, body: JSON.stringify({ refreshToken }) })
  }
  setTokens(null)
}

export async function backendMe(): Promise<{ user: BackendUser | null; error: string | null }> {
  const res = await apiFetch<{ user: BackendUser }>('/me')
  if (res.error || !res.data) return { user: null, error: res.error ?? 'me_failed' }
  return { user: res.data.user, error: null }
}

export async function backendPatchMe(patch: PatchMePayload): Promise<{ user: BackendUser | null; error: string | null }> {
  const res = await apiFetch<{ user: BackendUser }>('/me', { method: 'PATCH', body: JSON.stringify(patch) })
  if (res.error || !res.data) return { user: null, error: res.error ?? 'patch_me_failed' }
  return { user: res.data.user, error: null }
}

export async function backendForgotPassword(email: string): Promise<{ ok: boolean; error: string | null }> {
  const res = await apiFetch<{ ok: boolean }>(
    '/auth/forgot-password',
    { method: 'POST', skipAuth: true, body: JSON.stringify({ email }) },
  )
  if (res.error || !res.data) return { ok: false, error: res.error ?? 'forgot_password_failed' }
  return { ok: Boolean(res.data.ok), error: null }
}

export async function backendResetPassword(token: string, newPassword: string): Promise<{ ok: boolean; error: string | null }> {
  const res = await apiFetch<{ ok: boolean }>(
    '/auth/reset-password',
    { method: 'POST', skipAuth: true, body: JSON.stringify({ token, newPassword }) },
  )
  if (res.error || !res.data) return { ok: false, error: res.error ?? 'reset_password_failed' }
  return { ok: Boolean(res.data.ok), error: null }
}
