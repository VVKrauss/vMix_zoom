import { useMemo } from 'react'
import type { PeerPresenceDisplay } from '../lib/messengerPeerPresence'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import { useOnlinePresenceMirror } from './useOnlinePresenceMirror'

/**
 * Онлайн-состояние собеседников в дереве чатов (только ЛС + пользователи из глобального поиска).
 * ЕДИНЫЙ источник: зеркало `user_presence_public` (как realtime, так и локальный тик для истечения окна).
 */
export function useMessengerSidebarDirectPeersOnline(
  viewerId: string | undefined,
  items: MessengerConversationSummary[],
  extraUserIds: readonly string[],
): Record<string, PeerPresenceDisplay> {
  const peerIdKey = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) {
      if (it.kind !== 'direct') continue
      const o = it.otherUserId?.trim()
      if (o && viewerId && o !== viewerId) s.add(o)
    }
    for (const raw of extraUserIds) {
      const id = raw.trim()
      if (id && viewerId && id !== viewerId) s.add(id)
    }
    return [...s].sort()
  }, [items, extraUserIds, viewerId])

  return useOnlinePresenceMirror({ viewerId, userIds: peerIdKey, tickMs: 1500 })
}
