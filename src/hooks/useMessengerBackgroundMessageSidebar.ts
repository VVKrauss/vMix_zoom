import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  MESSENGER_BG_MESSAGE_EVENT,
  type MessengerBgMessageDetail,
} from '../lib/messengerUnreadRealtime'
import {
  listMessengerConversationsWithContactAliases,
  type MessengerConversationSummary,
} from '../lib/messengerConversations'
import { playMessageSound } from '../lib/messengerSound'

/**
 * Фоновые диалоги: обновление превью в дереве, когда сообщение приходит не в открытый тред.
 * `foregroundThreadConversationId` — id чата, который пользователь реально смотрит (маршрут + VM),
 * не путать с `activeConversationId` страницы (он бывает пустым при loading / mobile list).
 */
export function useMessengerBackgroundMessageSidebar(opts: {
  userId: string | undefined
  /** Открытый тред: не бейдж, не звук, не превью как «непрочитанное». */
  foregroundThreadConversationId: string
  mutedConversationIdsRef: MutableRefObject<Set<string>>
  setItems: Dispatch<SetStateAction<MessengerConversationSummary[]>>
}): void {
  const { userId, foregroundThreadConversationId, mutedConversationIdsRef, setItems } = opts

  useEffect(() => {
    const uid = userId
    if (!uid) return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MessengerBgMessageDetail>).detail
      const { conversationId: cid, senderUserId, kind, body, createdAt, replyToMessageId } = detail

      if (cid.trim() === foregroundThreadConversationId.trim()) return
      if (kind === 'reaction') return

      setItems((prev) => {
        const idx = prev.findIndex((item) => item.id === cid)
        if (idx === -1) {
          queueMicrotask(() => {
            void listMessengerConversationsWithContactAliases().then((r) => {
              if (!r.error && r.data) setItems(r.data)
            })
          })
          return prev
        }
        return prev.map((item) =>
          item.id === cid
            ? {
                ...item,
                lastMessageAt: createdAt,
                lastMessagePreview:
                  item.kind === 'channel' && replyToMessageId ? item.lastMessagePreview : body,
                unreadCount: senderUserId !== uid ? item.unreadCount + 1 : item.unreadCount,
                messageCount: item.messageCount + 1,
              }
            : item,
        )
      })

      if (senderUserId !== uid) {
        if (mutedConversationIdsRef.current.has(cid)) return
        playMessageSound()
      }
    }

    window.addEventListener(MESSENGER_BG_MESSAGE_EVENT, handler)
    return () => window.removeEventListener(MESSENGER_BG_MESSAGE_EVENT, handler)
  }, [foregroundThreadConversationId, userId])
}
