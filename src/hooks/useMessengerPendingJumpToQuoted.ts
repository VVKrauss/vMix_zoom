import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { DirectMessage } from '../lib/messenger'
import type { MessengerConversationKind } from '../lib/messengerConversations'
import type { MessengerPendingJumpState } from './useMessengerThreadBootstrap'

/**
 * Переход по forward/jump: скролл к цитате или догрузка старых сообщений в direct.
 */
export function useMessengerPendingJumpToQuoted(opts: {
  pendingJump: MessengerPendingJumpState
  setPendingJump: Dispatch<SetStateAction<MessengerPendingJumpState>>
  activeConversationId: string
  threadHeadKind: MessengerConversationKind | null | undefined
  messages: DirectMessage[]
  threadLoading: boolean
  loadingOlder: boolean
  hasMoreOlder: boolean
  loadOlderMessages: () => Promise<void>
  scrollToQuotedMessage: (quotedId: string) => void
}): void {
  const {
    pendingJump,
    setPendingJump,
    activeConversationId,
    threadHeadKind,
    messages,
    threadLoading,
    loadingOlder,
    hasMoreOlder,
    loadOlderMessages,
    scrollToQuotedMessage,
  } = opts

  const pendingJumpOlderAttemptsRef = useRef(0)

  useEffect(() => {
    const j = pendingJump
    if (!j) return
    const activeId = activeConversationId.trim()
    if (!activeId || j.conversationId.trim() !== activeId) return
    if (threadHeadKind !== 'direct') return

    if (messages.some((m) => m.id === j.messageId)) {
      pendingJumpOlderAttemptsRef.current = 0
      scrollToQuotedMessage(j.messageId)
      setPendingJump(null)
      return
    }

    if (threadLoading || loadingOlder) return
    if (!hasMoreOlder) {
      pendingJumpOlderAttemptsRef.current = 0
      setPendingJump(null)
      return
    }
    if (pendingJumpOlderAttemptsRef.current > 12) {
      pendingJumpOlderAttemptsRef.current = 0
      setPendingJump(null)
      return
    }
    pendingJumpOlderAttemptsRef.current += 1
    void loadOlderMessages()
  }, [
    activeConversationId,
    hasMoreOlder,
    loadOlderMessages,
    loadingOlder,
    messages,
    pendingJump,
    scrollToQuotedMessage,
    setPendingJump,
    threadHeadKind,
    threadLoading,
  ])
}
