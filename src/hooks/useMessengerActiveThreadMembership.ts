import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { hasPendingConversationJoinRequest } from '../lib/chatRequests'

/**
 * Роль текущего пользователя в открытом чате и флаг pending join request (для UI группы/канала).
 */
export function useMessengerActiveThreadMembership(opts: {
  activeConversationId: string
  userId: string | undefined
  setActiveConversationRole: Dispatch<SetStateAction<string | null>>
  setActiveConversationRoleLoading: Dispatch<SetStateAction<boolean>>
  setPendingJoinRequest: Dispatch<SetStateAction<boolean | null>>
  setJoinRequestError: Dispatch<SetStateAction<string | null>>
}): void {
  const {
    activeConversationId,
    userId,
    setActiveConversationRole,
    setActiveConversationRoleLoading,
    setPendingJoinRequest,
    setJoinRequestError,
  } = opts

  useEffect(() => {
    let active = true
    const cid = activeConversationId.trim()
    if (!userId || !cid) {
      setActiveConversationRole(null)
      setPendingJoinRequest(null)
      return
    }

    setActiveConversationRoleLoading(true)
    setActiveConversationRole(null)
    setPendingJoinRequest(null)

    // Supabase removed. Membership role is fetched per-thread in thread panes via backend.
    void hasPendingConversationJoinRequest(cid).then((pendingRes) => {
      if (!active) return
      setActiveConversationRole(null)
      if (pendingRes.error) {
        setPendingJoinRequest(null)
        setJoinRequestError(pendingRes.error)
      } else {
        setPendingJoinRequest(Boolean(pendingRes.data))
      }
    }).finally(() => {
      if (active) setActiveConversationRoleLoading(false)
    })

    return () => {
      active = false
    }
  }, [activeConversationId, userId])
}
