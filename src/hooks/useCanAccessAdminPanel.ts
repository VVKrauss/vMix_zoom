import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../context/ProfileContext'

/**
 * Доступ к `/admin`: только через first-party профиль `/api/v1/me/profile`.
 * Legacy `/api/db/*` запрещён.
 */
export function useCanAccessAdminPanel(): {
  allowed: boolean
  loading: boolean
  isSuperadmin: boolean
} {
  const { user } = useAuth()
  const uid = user?.id
  const { profile, loading: profileLoading } = useProfile()
  const [allowed, setAllowed] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  /** Пока не знаем ответ RPC — true (иначе AdminProtectedRoute мгновенно редиректит с /admin на /). */
  const [loading, setLoading] = useState(() => Boolean(uid))

  useEffect(() => {
    if (!uid) {
      setAllowed(false)
      setIsSuperadmin(false)
      setLoading(false)
      return
    }
    if (profileLoading) {
      setLoading(true)
      return
    }
    const codes = new Set((profile?.global_roles ?? []).map((r) => r.code))
    const superadmin = codes.has('superadmin')
    const staff = superadmin || codes.has('platform_admin') || codes.has('support_admin')
    setAllowed(staff)
    setIsSuperadmin(superadmin)
    setLoading(false)
  }, [uid, profileLoading, profile?.global_roles])

  return { allowed, loading, isSuperadmin }
}
