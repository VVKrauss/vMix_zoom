import { useEffect } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { buildMessengerUrl } from '../lib/messengerDashboardUtils'

/** Сегмент `/dashboard/messenger/:id` в истории → канонический `?chat=` + with/title. */
export function useMessengerRouteSegmentQuerySync(opts: {
  routeConversationId: string
  searchConversationId: string
  targetUserId: string
  targetTitle: string
  /** Сохранить `msg` / `post` при синхронизации сегмента в query (шаринг поста). */
  preserveMessageId?: string
  preserveParentMessageId?: string
  navigate: NavigateFunction
}): void {
  const {
    routeConversationId,
    searchConversationId,
    targetUserId,
    targetTitle,
    preserveMessageId,
    preserveParentMessageId,
    navigate,
  } = opts
  useEffect(() => {
    if (!routeConversationId || searchConversationId) return
    navigate(
      buildMessengerUrl(routeConversationId, targetUserId || undefined, targetTitle || undefined, {
        messageId: preserveMessageId || undefined,
        parentMessageId: preserveParentMessageId || undefined,
      }),
      { replace: true },
    )
  }, [
    navigate,
    routeConversationId,
    searchConversationId,
    targetTitle,
    targetUserId,
    preserveMessageId,
    preserveParentMessageId,
  ])
}
