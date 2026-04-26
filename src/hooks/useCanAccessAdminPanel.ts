import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchJson } from '../api/http'

type AdminAccessInfo = { staff?: boolean; superadmin?: boolean }

function parseAccessInfo(raw: unknown): AdminAccessInfo {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  return {
    staff: o.staff === true,
    superadmin: o.superadmin === true,
  }
}

/**
 * Доступ к `/admin`: RPC `admin_access_info()` (SECURITY DEFINER), т.к. у `users` RLS только «своя строка»
 * и проверка только через `user_global_roles` с клиента может быть ненадёжной.
 */
export function useCanAccessAdminPanel(): {
  allowed: boolean
  loading: boolean
  isSuperadmin: boolean
} {
  const { user } = useAuth()
  const uid = user?.id
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
    let cancelled = false
    setLoading(true)
    void (async () => {
      const r = await fetchJson<AdminAccessInfo>('/api/db/rpc/admin_access_info', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ args: {} }),
      })
      if (cancelled) return
      if (!r.ok) {
        setAllowed(false)
        setIsSuperadmin(false)
        setLoading(false)
        return
      }
      const info = parseAccessInfo(r.data)
      setAllowed(info.staff === true)
      setIsSuperadmin(info.superadmin === true)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [uid])

  return { allowed, loading, isSuperadmin }
}
