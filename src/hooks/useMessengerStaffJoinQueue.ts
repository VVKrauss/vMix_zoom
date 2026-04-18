import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  listConversationJoinRequests,
  type ConversationJoinRequest,
} from '../lib/chatRequests'
import { listConversationMembersForManagement, type ConversationMemberRow } from '../lib/conversationMembers'
import { MESSENGER_JOIN_REQUEST_MANAGER_ROLES } from '../lib/messengerDashboardUtils'
import type { MessengerConversationKind } from '../lib/messengerConversations'

/**
 * Очередь заявок на вступление и список участников для модераторов группы/канала.
 */
export function useMessengerStaffJoinQueue(opts: {
  activeConversationId: string
  userId: string | undefined
  activeConversationRole: string | null
  activeOpenThreadKind: MessengerConversationKind | null
  setConversationJoinRequests: Dispatch<SetStateAction<ConversationJoinRequest[]>>
  setJoinRequestsLoading: Dispatch<SetStateAction<boolean>>
  setConversationMembers: Dispatch<SetStateAction<ConversationMemberRow[]>>
  setMembersLoading: Dispatch<SetStateAction<boolean>>
  setJoinRequestError: Dispatch<SetStateAction<string | null>>
}): void {
  const {
    activeConversationId,
    userId,
    activeConversationRole,
    activeOpenThreadKind,
    setConversationJoinRequests,
    setJoinRequestsLoading,
    setConversationMembers,
    setMembersLoading,
    setJoinRequestError,
  } = opts

  useEffect(() => {
    if (
      !userId ||
      !activeConversationId.trim() ||
      !activeConversationRole ||
      !MESSENGER_JOIN_REQUEST_MANAGER_ROLES.has(activeConversationRole) ||
      (activeOpenThreadKind !== 'group' && activeOpenThreadKind !== 'channel')
    ) {
      setConversationJoinRequests([])
      setConversationMembers([])
      return
    }

    let active = true
    setJoinRequestsLoading(true)
    setConversationJoinRequests([])
    setMembersLoading(true)
    setConversationMembers([])

    void listConversationJoinRequests(activeConversationId.trim()).then((res) => {
      if (!active) return
      if (res.error) {
        setJoinRequestError(res.error)
        setConversationJoinRequests([])
      } else {
        setConversationJoinRequests(res.data ?? [])
      }
    }).finally(() => {
      if (active) setJoinRequestsLoading(false)
    })

    void listConversationMembersForManagement(activeConversationId.trim()).then((res) => {
      if (!active) return
      if (res.error) {
        setConversationMembers([])
      } else {
        setConversationMembers(res.data ?? [])
      }
    }).finally(() => {
      if (active) setMembersLoading(false)
    })

    return () => {
      active = false
    }
  }, [activeConversationId, activeConversationRole, activeOpenThreadKind, userId])
}
