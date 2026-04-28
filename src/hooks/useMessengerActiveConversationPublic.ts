import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import { fetchJson } from '../api/http'

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
    void (async () => {
      try {
        const r = await fetchJson<{ row: any | null }>(`/api/v1/conversations/${encodeURIComponent(cid)}/public-info`, { method: 'GET', auth: true })
        if (!active) return
        if (!r.ok || !r.data?.row) {
          setActiveConversationIsPublic(null)
          return
        }
        const row = r.data.row as { kind?: unknown; group_is_public?: unknown; channel_is_public?: unknown }
        const kind = typeof row.kind === 'string' ? row.kind : ''
        const isPublic = kind === 'channel' ? row.channel_is_public === true : row.group_is_public === true
        setActiveConversationIsPublic(Boolean(isPublic))
      } finally {
        if (active) setActiveConversationIsPublicLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [activeConversationId, threadHeadConversation?.kind, userId])
}
