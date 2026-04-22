import { useMemo } from 'react'
import type { DirectMessage } from '../lib/messenger'
import { useMessengerContactDisplayOverridesMap } from './useMessengerContactDisplayOverridesMap'

/** Локальные имена и аватары контактов для отправителей в переданной ленте сообщений. */
export function useMessengerPeerContactDisplayForMessages(
  viewerUserId: string | undefined,
  messages: readonly DirectMessage[],
  enabled: boolean,
): { peerAliasByUserId: Record<string, string>; peerDisplayAvatarUrlByUserId: Record<string, string> } {
  const peerIds = useMemo(() => {
    const s = new Set<string>()
    const vid = viewerUserId?.trim() ?? ''
    for (const m of messages) {
      const id = m.senderUserId?.trim()
      if (id && id !== vid) s.add(id)
    }
    return Array.from(s).sort()
  }, [messages, viewerUserId])

  return useMessengerContactDisplayOverridesMap(Boolean(enabled && peerIds.length > 0), peerIds)
}
