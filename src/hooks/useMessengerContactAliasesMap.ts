import { useEffect, useMemo, useState } from 'react'
import { MESSENGER_CONTACT_ALIAS_CHANGED_EVENT } from '../lib/messenger'
import { listMyContactAliases } from '../lib/socialGraph'

/**
 * Локальные имена контактов для текущего пользователя (по `contact_user_id`).
 * Обновляется при событии смены алиаса в приложении.
 */
export function useMessengerContactAliasesMap(enabled: boolean, userIds: readonly string[]): Record<string, string> {
  const idKey = useMemo(
    () => Array.from(new Set(userIds.map((x) => String(x ?? '').trim()).filter(Boolean))).sort().join('|'),
    [userIds],
  )

  const [map, setMap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!enabled || !idKey) {
      setMap({})
      return
    }
    const ids = idKey.split('|')
    let cancelled = false

    const fetchAndSet = () => {
      void listMyContactAliases(ids).then((res) => {
        if (cancelled) return
        setMap(res.data && !res.error ? res.data : {})
      })
    }

    fetchAndSet()

    window.addEventListener(MESSENGER_CONTACT_ALIAS_CHANGED_EVENT, fetchAndSet)
    return () => {
      cancelled = true
      window.removeEventListener(MESSENGER_CONTACT_ALIAS_CHANGED_EVENT, fetchAndSet)
    }
  }, [enabled, idKey])

  return map
}
