import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { requestMessengerUnreadRefresh } from '../lib/messenger'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import type { DirectMessage } from '../lib/messenger'

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
    // Supabase realtime removed. We'll reintroduce this via backend socket.io events later.
    void userId
    void navigate
    void conversationIdRef
    void setItems
    void setPendingJoinSidebarById
    void setMessages
    void setActiveConversation
    void requestMessengerUnreadRefresh
  }, [navigate, userId])
}
