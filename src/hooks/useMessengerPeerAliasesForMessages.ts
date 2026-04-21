import { useMemo } from 'react'
import type { DirectMessage } from '../lib/messenger'
import { useMessengerContactAliasesMap } from './useMessengerContactAliasesMap'

/**
 * Локальные алиасы для отправителей в переданной ленте сообщений (группа/канал и т.п.).
 */
export function useMessengerPeerAliasesForMessages(
  viewerUserId: string | undefined,
  messages: readonly DirectMessage[],
  enabled: boolean,
): Record<string, string> {
  const peerIds = useMemo(() => {
    const s = new Set<string>()
    const vid = viewerUserId?.trim() ?? ''
    for (const m of messages) {
      const id = m.senderUserId?.trim()
      if (id && id !== vid) s.add(id)
    }
    return Array.from(s).sort()
  }, [messages, viewerUserId])

  return useMessengerContactAliasesMap(Boolean(enabled && peerIds.length > 0), peerIds)
}
