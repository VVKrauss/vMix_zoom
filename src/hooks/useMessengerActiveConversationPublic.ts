import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { MessengerConversationSummary } from '../lib/messengerConversations'

/**
 * Публичность группы/канала для шапки треда (отдельно от summary в списке).
 */
export function useMessengerActiveConversationPublic(opts: {
  userId: string | undefined
  activeConversationId: string
  threadHeadConversation: MessengerConversationSummary | null | undefined
  setActiveConversationIsPublic: Dispatch<SetStateAction<boolean | null>>
  setActiveConversationIsPublicLoading: Dispatch<SetStateAction<boolean>>
}): void {
  const {
    userId,
    activeConversationId,
    threadHeadConversation,
    setActiveConversationIsPublic,
    setActiveConversationIsPublicLoading,
  } = opts

  useEffect(() => {
    const cid = activeConversationId.trim()
    if (!userId || !cid) {
      setActiveConversationIsPublic(null)
      setActiveConversationIsPublicLoading(false)
      return
    }
    if (
      !threadHeadConversation ||
      (threadHeadConversation.kind !== 'group' && threadHeadConversation.kind !== 'channel')
    ) {
      setActiveConversationIsPublic(null)
      setActiveConversationIsPublicLoading(false)
      return
    }
    // Supabase removed; fallback to the summary from sidebar.
    setActiveConversationIsPublicLoading(false)
    setActiveConversationIsPublic(threadHeadConversation.isPublic !== false)
  }, [activeConversationId, threadHeadConversation?.kind, userId])
}
