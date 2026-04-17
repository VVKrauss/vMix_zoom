import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

interface Props {
  children: ReactNode
}

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="join-screen">
        <div className="auth-loading" aria-label="Загрузка…" />
      </div>
    )
  }

  if (!user) {
    // Preserve full URL so user returns after auth (important for invite links and deep-links).
    const from = `${location.pathname}${location.search || ''}${location.hash || ''}`
    return <Navigate to="/login" state={{ from }} replace />
  }

  return <>{children}</>
}
