import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import { getMyConversationNotificationMutes } from '../lib/conversationNotifications'
import type { MessengerConversationSummary } from '../lib/messengerConversations'

/**
 * Мьют уведомлений по списку чатов; ref — актуальный Set для колбэков без лишних зависимостей.
 */
export function useMessengerConversationNotificationMutes(
  userId: string | undefined,
  items: MessengerConversationSummary[],
): {
  mutedConversationIds: Set<string>
  setMutedConversationIds: Dispatch<SetStateAction<Set<string>>>
  mutedConversationIdsRef: MutableRefObject<Set<string>>
} {
  const [mutedConversationIds, setMutedConversationIds] = useState<Set<string>>(new Set())
  const mutedConversationIdsRef = useRef<Set<string>>(new Set())
  mutedConversationIdsRef.current = mutedConversationIds

  useEffect(() => {
    const uid = userId?.trim() ?? ''
    if (!uid) {
      setMutedConversationIds(new Set())
      return
    }
    const ids = items.map((i) => i.id).filter(Boolean)
    if (ids.length === 0) {
      setMutedConversationIds(new Set())
      return
    }
    let cancelled = false
    void getMyConversationNotificationMutes(ids).then((res) => {
      if (cancelled) return
      if (res.error || !res.data) return
      const next = new Set<string>()
      for (const [cid, muted] of Object.entries(res.data)) {
        if (muted) next.add(cid)
      }
      setMutedConversationIds(next)
    })
    return () => {
      cancelled = true
    }
  }, [userId, items])

  return { mutedConversationIds, setMutedConversationIds, mutedConversationIdsRef }
}
