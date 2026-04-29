import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { requestMessengerUnreadRefresh } from '../lib/messenger'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import type { DirectMessage } from '../lib/messenger'
import { rtChannel, rtRemoveChannel } from '../api/realtimeCompat'

/**
 * DELETE в chat_conversation_members для текущего пользователя — убрать чат из дерева (в т.ч. взаимное скрытие ЛС).
 */
export function useMessengerSelfMembershipDeleteRealtime(opts: {
  userId: string | undefined
  navigate: NavigateFunction
  conversationIdRef: MutableRefObject<string>
  setItems: Dispatch<SetStateAction<MessengerConversationSummary[]>>
  setPendingJoinSidebarById: Dispatch<
    SetStateAction<Record<string, MessengerConversationSummary>>
  >
  setMessages: Dispatch<SetStateAction<DirectMessage[]>>
  setActiveConversation: Dispatch<SetStateAction<MessengerConversationSummary | null>>
}): void {
  const {
    userId,
    navigate,
    conversationIdRef,
    setItems,
    setPendingJoinSidebarById,
    setMessages,
    setActiveConversation,
  } = opts

  useEffect(() => {
    const uid = userId?.trim() ?? ''
    if (!uid) return
    const channel = rtChannel(`messenger-member-self-delete:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_conversation_members',
          filter: `user_id=eq.${uid}`,
        },
        (payload: any) => {
          const oldRow = payload.old as Record<string, unknown>
          const raw = oldRow?.conversation_id
          const convId = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : ''
          if (!convId) return
          setItems((prev) => prev.filter((i) => i.id !== convId))
          setPendingJoinSidebarById((prev) => {
            if (!prev[convId]) return prev
            const next = { ...prev }
            delete next[convId]
            return next
          })
          requestMessengerUnreadRefresh()
          if (conversationIdRef.current.trim() === convId) {
            setMessages([])
            setActiveConversation(null)
            navigate('/dashboard/messenger?view=list', { replace: true })
          }
        },
      )
      .subscribe()

    return () => {
      rtRemoveChannel(channel)
    }
  }, [navigate, userId])
}
