import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { BackendUser } from '../lib/backend/authApi'
import { backendMe, backendSignIn, backendSignOut, backendSignUp } from '../lib/backend/authApi'
import { clearDesktopRoomViewStorage } from '../config/roomUiStorage'
import { HOST_SESSION_KEY, PENDING_HOST_CLAIM_KEY } from '../lib/spaceRoom'

interface AuthContextValue {
  user: BackendUser | null
  /** зарезервировано под refresh/session info (пока не нужно фронту) */
  session: null
  /** true пока идёт первоначальная проверка сессии */
  loading: boolean
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<BackendUser | null>(null)
  const [session]             = useState<null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void backendMe().then(({ user }) => {
      if (cancelled) return
      setUser(user)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const res = await backendSignUp(email, password, displayName)
    if (res.error) return { error: res.error }
    setUser(res.user)
    return { error: null }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await backendSignIn(email, password)
    if (res.error) return { error: res.error }
    setUser(res.user)
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
    await backendSignOut()
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
