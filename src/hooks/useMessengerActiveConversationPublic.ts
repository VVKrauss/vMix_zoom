import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import { supabase } from '../lib/supabase'

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
    let active = true
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
    setActiveConversationIsPublicLoading(true)
    supabase
      .from('chat_conversations')
      .select('kind, group_is_public, channel_is_public')
      .eq('id', cid)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (!active) return
          if (error || !data) {
            setActiveConversationIsPublic(null)
            return
          }
          const row = data as { kind?: unknown; group_is_public?: unknown; channel_is_public?: unknown }
          const kind = typeof row.kind === 'string' ? row.kind : ''
          const isPublic = kind === 'channel' ? row.channel_is_public === true : row.group_is_public === true
          setActiveConversationIsPublic(Boolean(isPublic))
        },
        () => {
          if (!active) return
          setActiveConversationIsPublic(null)
        },
      )
      .then(
        () => {
          if (!active) return
          setActiveConversationIsPublicLoading(false)
        },
        () => {
          if (!active) return
          setActiveConversationIsPublicLoading(false)
        },
      )
    return () => {
      active = false
    }
  }, [activeConversationId, threadHeadConversation?.kind, userId])
}
