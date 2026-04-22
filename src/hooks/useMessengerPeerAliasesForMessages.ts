import type { DirectMessage } from '../lib/messenger'
import { useMessengerPeerContactDisplayForMessages } from './useMessengerPeerContactDisplayForMessages'

/**
 * Локальные алиасы для отправителей в переданной ленте сообщений (группа/канал и т.п.).
 */
export function useMessengerPeerAliasesForMessages(
  viewerUserId: string | undefined,
  messages: readonly DirectMessage[],
  enabled: boolean,
): Record<string, string> {
  const { peerAliasByUserId } = useMessengerPeerContactDisplayForMessages(viewerUserId, messages, enabled)
  return peerAliasByUserId
}
