import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { normalizeSupabaseStoragePublicUrl } from '../lib/supabaseStorageUrl'
import { getEmailConfirmationRedirectUrl } from '../config/authUrls'
import { clearDesktopRoomViewStorage } from '../config/roomUiStorage'
import { HOST_SESSION_KEY, PENDING_HOST_CLAIM_KEY } from '../lib/spaceRoom'

/** Дольше — считаем проверку сессии при старте неуспешной (обрывы до Supabase Auth из части сетей). */
const SESSION_BOOTSTRAP_TIMEOUT_MS = 12_000

/** Результат {@link AuthContextValue.signUp}: при отсутствии ошибки `sessionEstablished` отражает режим сервера (autoconfirm vs письмо). */
export type SignUpResult =
  | { error: string; sessionEstablished?: undefined }
  | { error: null; sessionEstablished: boolean }

interface AuthContextValue {
  user: User | null
  session: Session | null
  /** true пока идёт первоначальная проверка сессии */
  loading: boolean
  /**
   * Сообщение, если при старте не удалось получить сессию вовремя (сеть к серверу авторизации).
   * Сбрасывается после успешного входа или через {@link clearAuthBootstrapError}.
   */
  authBootstrapError: string | null
  clearAuthBootstrapError: () => void
  signUp: (email: string, password: string, displayName: string) => Promise<SignUpResult>
  /** Повторная отправка письма подтверждения регистрации (пока `ENABLE_EMAIL_AUTOCONFIRM=false` и настроен SMTP). */
  resendSignupConfirmation: (email: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function userWithNormalizedStoragePublicUrls(user: User): User {
  const meta = { ...(user.user_metadata ?? {}) }
  const raw = meta.avatar_url
  if (typeof raw === 'string' && raw.trim()) {
    const n = normalizeSupabaseStoragePublicUrl(raw.trim())
    if (n) meta.avatar_url = n
  }
  return { ...user, user_metadata: meta }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authBootstrapError, setAuthBootstrapError] = useState<string | null>(null)

  const clearAuthBootstrapError = useCallback(() => {
    setAuthBootstrapError(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('session_bootstrap_timeout')), SESSION_BOOTSTRAP_TIMEOUT_MS)
        })
        const { data, error } = await Promise.race([supabase.auth.getSession(), timeoutPromise])
        if (cancelled) return
        if (error) {
          setAuthBootstrapError(error.message || 'Не удалось проверить вход. Обновите страницу или попробуйте позже.')
          setSession(null)
          setUser(null)
          return
        }
        setSession(data.session)
        setUser(data.session?.user ? userWithNormalizedStoragePublicUrls(data.session.user) : null)
        setAuthBootstrapError(null)
      } catch (e) {
        if (cancelled) return
        const timedOut = e instanceof Error && e.message === 'session_bootstrap_timeout'
        setAuthBootstrapError(
          timedOut
            ? 'Не удалось проверить вход: сервер авторизации не ответил вовремя. Проверьте интернет или VPN и обновите страницу.'
            : 'Не удалось проверить вход. Обновите страницу или попробуйте позже.',
        )
        setSession(null)
        setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ? userWithNormalizedStoragePublicUrls(newSession.user) : null)
      if (newSession) setAuthBootstrapError(null)
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    setAuthBootstrapError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: getEmailConfirmationRedirectUrl(),
      },
    })
    if (error) return { error: error.message }
    return { error: null, sessionEstablished: !!data.session }
  }, [])

  const resendSignupConfirmation = useCallback(async (email: string) => {
    setAuthBootstrapError(null)
    const redirect = getEmailConfirmationRedirectUrl()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: redirect ? { emailRedirectTo: redirect } : undefined,
    })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthBootstrapError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    clearDesktopRoomViewStorage()
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    try {
      sessionStorage.removeItem(HOST_SESSION_KEY)
      sessionStorage.removeItem(PENDING_HOST_CLAIM_KEY)
    } catch {
      /* noop */
    }
    await supabase.auth.signOut()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        authBootstrapError,
        clearAuthBootstrapError,
        signUp,
        resendSignupConfirmation,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  return ctx
}
