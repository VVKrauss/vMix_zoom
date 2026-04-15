import type { ReactNode } from 'react'

/**
 * Лёгкая обёртка для direct-треда внутри DashboardMessengerPage.
 * (Основная логика direct остаётся в DashboardMessengerPage.)
 */
export function DirectThreadPane({ children }: { children: ReactNode }) {
  return <>{children}</>
}

