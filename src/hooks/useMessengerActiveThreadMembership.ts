import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { hasPendingConversationJoinRequest } from '../lib/chatRequests'
import { dbTableSelectOne } from '../api/dbApi'

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

    void Promise.all([
      dbTableSelectOne<any>({
        table: 'chat_conversation_members',
        select: 'role',
        filters: { conversation_id: cid, user_id: userId },
      }),
      hasPendingConversationJoinRequest(cid),
    ]).then(([memberRes, pendingRes]) => {
      if (!active) return
      if (memberRes.ok && memberRes.data?.row) {
        const role = typeof (memberRes.data.row as { role?: unknown })?.role === 'string'
          ? String((memberRes.data.row as { role: string }).role).trim()
          : null
        setActiveConversationRole(role)
      } else {
        setActiveConversationRole(null)
      }
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
