import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'

type Props = { children: ReactNode }

export function AdminProtectedRoute({ children }: Props) {
  const { user, loading: authLoading } = useAuth()
  const { allowed, loading: roleLoading } = useCanAccessAdminPanel()
  const location = useLocation()

  if (authLoading || (user && roleLoading)) {
    return (
      <div className="join-screen">
        <div className="auth-loading" aria-label="Загрузка…" />
      </div>
    )
  }

  if (!user) {
    const from = `${location.pathname}${location.search || ''}${location.hash || ''}`
    return <Navigate to="/login" state={{ from }} replace />
  }

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
