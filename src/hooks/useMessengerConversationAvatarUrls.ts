import { useEffect, useRef, useState } from 'react'
import { getMessengerImageSignedUrl } from '../lib/messenger'
import type { MessengerConversationSummary } from '../lib/messengerConversations'

/**
 * Signed URL для аватарок групп/каналов в сайдбаре (ленивая подгрузка по пути из summary).
 */
export function useMessengerConversationAvatarUrls(
  items: MessengerConversationSummary[],
): Record<string, string> {
  const [conversationAvatarUrlById, setConversationAvatarUrlById] = useState<Record<string, string>>({})
  const itemsRef = useRef(items)
  itemsRef.current = items

  useEffect(() => {
    let active = true
    const run = async () => {
      const missing = (itemsRef.current ?? []).filter(
        (it) =>
          (it.kind === 'group' || it.kind === 'channel') &&
          Boolean(it.avatarThumbPath?.trim() || it.avatarPath?.trim()) &&
          !conversationAvatarUrlById[it.id],
      )
      if (missing.length === 0) return
      for (const it of missing) {
        const path = (it.avatarThumbPath?.trim() || it.avatarPath?.trim() || '').trim()
        if (!path) continue
        const signed = await getMessengerImageSignedUrl(path, 3600)
        if (!active) return
        if (signed.url) {
          setConversationAvatarUrlById((prev) => (prev[it.id] ? prev : { ...prev, [it.id]: signed.url! }))
        }
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [items, conversationAvatarUrlById])

  return conversationAvatarUrlById
}
