import { useEffect, useMemo, useState } from 'react'
import { MESSENGER_CONTACT_ALIAS_CHANGED_EVENT } from '../lib/messenger'
import { listMyContactDisplayOverrides } from '../lib/socialGraph'

/**
 * Локальные имена и URL аватаров контактов для текущего пользователя (по `contact_user_id`).
 */
export function useMessengerContactDisplayOverridesMap(
  enabled: boolean,
  userIds: readonly string[],
): { peerAliasByUserId: Record<string, string>; peerDisplayAvatarUrlByUserId: Record<string, string> } {
  const idKey = useMemo(
    () => Array.from(new Set(userIds.map((x) => String(x ?? '').trim()).filter(Boolean))).sort().join('|'),
    [userIds],
  )

  const [aliasMap, setAliasMap] = useState<Record<string, string>>({})
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!enabled || !idKey) {
      setAliasMap({})
      setAvatarMap({})
      return
    }
    const ids = idKey.split('|')
    let cancelled = false

    const fetchAndSet = () => {
      void listMyContactDisplayOverrides(ids).then((res) => {
        if (cancelled) return
        if (!res.data || res.error) {
          setAliasMap({})
          setAvatarMap({})
          return
        }
        const aliases: Record<string, string> = {}
        const avatars: Record<string, string> = {}
        for (const [uid, row] of Object.entries(res.data)) {
          const a = row.alias.trim()
          if (a) aliases[uid] = a
          const u = row.displayAvatarUrl?.trim() ?? ''
          if (u) avatars[uid] = u
        }
        setAliasMap(aliases)
        setAvatarMap(avatars)
      })
    }

    fetchAndSet()

    window.addEventListener(MESSENGER_CONTACT_ALIAS_CHANGED_EVENT, fetchAndSet)
    return () => {
      cancelled = true
      window.removeEventListener(MESSENGER_CONTACT_ALIAS_CHANGED_EVENT, fetchAndSet)
    }
  }, [enabled, idKey])

  return { peerAliasByUserId: aliasMap, peerDisplayAvatarUrlByUserId: avatarMap }
}
