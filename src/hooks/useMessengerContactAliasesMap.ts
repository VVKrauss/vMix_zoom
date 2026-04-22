import { useMessengerContactDisplayOverridesMap } from './useMessengerContactDisplayOverridesMap'

/**
 * Локальные имена контактов для текущего пользователя (по `contact_user_id`).
 * Обновляется при событии смены алиаса в приложении.
 */
export function useMessengerContactAliasesMap(enabled: boolean, userIds: readonly string[]): Record<string, string> {
  const { peerAliasByUserId } = useMessengerContactDisplayOverridesMap(enabled, userIds)
  return peerAliasByUserId
}
