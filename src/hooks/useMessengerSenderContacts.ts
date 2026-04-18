import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { getContactStatuses, type ContactStatus } from '../lib/socialGraph'
import type { DirectMessage } from '../lib/messenger'

/**
 * Статусы контактов для отправителей сообщений в активном треде (для UI «закреплён у меня» и т.п.).
 */
export function useMessengerSenderContacts(
  userId: string | undefined,
  messages: DirectMessage[],
): {
  senderContactByUserId: Record<string, ContactStatus>
  setSenderContactByUserId: Dispatch<SetStateAction<Record<string, ContactStatus>>>
} {
  const [senderContactByUserId, setSenderContactByUserId] = useState<Record<string, ContactStatus>>({})

  const messengerSenderUserIds = useMemo(() => {
    const s = new Set<string>()
    for (const m of messages) {
      const id = m.senderUserId?.trim()
      if (id && id !== (userId ?? '')) s.add(id)
    }
    return [...s]
  }, [messages, userId])

  useEffect(() => {
    let cancelled = false
    if (!userId || messengerSenderUserIds.length === 0) {
      setSenderContactByUserId({})
      return
    }
    void getContactStatuses(messengerSenderUserIds).then((result) => {
      if (cancelled || !result.data) return
      setSenderContactByUserId(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [userId, messengerSenderUserIds.join('|')])

  return { senderContactByUserId, setSenderContactByUserId }
}
