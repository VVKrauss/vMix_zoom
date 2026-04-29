import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getEmailConfirmationRedirectUrl } from '../config/authUrls'
import { clearDesktopRoomViewStorage } from '../config/roomUiStorage'
import { HOST_SESSION_KEY, PENDING_HOST_CLAIM_KEY } from '../lib/spaceRoom'
import { authGetSession, authSignIn, authSignOut, authSignUp, type AuthSession, type AuthUser } from '../api/authApi'

interface AuthContextValue {
  user: AuthUser | null
  session: AuthSession | null
  /** true пока идёт первоначальная проверка сессии */
  loading: boolean
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void authGetSession().then((r) => {
      if (!alive) return
      if (r.ok) {
        setSession(r.data.session)
        setUser(r.data.session?.user ?? null)
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const r = await authSignUp({ email, password, displayName })
    if (!r.ok) return { error: r.error.message }
    setSession(r.data.session)
    setUser(r.data.session?.user ?? null)
    return { error: null }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await authSignIn({ email, password })
    if (!r.ok) return { error: r.error.message }
    setSession(r.data.session)
    setUser(r.data.session.user)
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
    await authSignOut()
    setSession(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth должен использоваться внутри <AuthProvider>')
  return ctx
}
