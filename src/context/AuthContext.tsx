import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getEmailConfirmationRedirectUrl } from '../config/authUrls'
import { clearDesktopRoomViewStorage } from '../config/roomUiStorage'
import { HOST_SESSION_KEY, PENDING_HOST_CLAIM_KEY } from '../lib/spaceRoom'

interface AuthContextValue {
  user: User | null
  session: Session | null
  /** true пока идёт первоначальная проверка сессии */
  loading: boolean
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null }>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Читаем текущую сессию при монтировании
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    // Слушаем изменения: вход, выход, рефреш токена
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: getEmailConfirmationRedirectUrl(),
      },
    })
    if (error) return { error: error.message }
    return { error: null }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
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
