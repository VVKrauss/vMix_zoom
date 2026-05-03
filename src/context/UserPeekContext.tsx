import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { UserProfilePeekModal } from '../components/UserProfilePeekModal'
import type { UserPeekTarget } from '../types/userPeek'

export type { UserPeekTarget } from '../types/userPeek'

type UserPeekContextValue = {
  openUserPeek: (target: UserPeekTarget) => void
}

const UserPeekContext = createContext<UserPeekContextValue | null>(null)

export function useUserPeek(): UserPeekContextValue {
  const v = useContext(UserPeekContext)
  if (!v) {
    return {
      openUserPeek: () => {
        /* no-op вне провайдера */
      },
    }
  }
  return v
}

export function UserPeekProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<UserPeekTarget | null>(null)

  const openUserPeek = useCallback((t: UserPeekTarget) => {
    const id = t.userId?.trim()
    if (!id) return
    setTarget({
      userId: id,
      displayName: t.displayName ?? null,
      avatarUrl: t.avatarUrl ?? null,
      directThreadMessageCount:
        typeof t.directThreadMessageCount === 'number' && Number.isFinite(t.directThreadMessageCount)
          ? t.directThreadMessageCount
          : null,
    })
  }, [])

  const close = useCallback(() => setTarget(null), [])

  const value = useMemo(() => ({ openUserPeek }), [openUserPeek])

  return (
    <UserPeekContext.Provider value={value}>
      {children}
      <UserProfilePeekModal open={Boolean(target)} onClose={close} target={target} />
    </UserPeekContext.Provider>
  )
}
