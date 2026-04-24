import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  listDirectMessagesPage,
  mapDirectMessageFromRow,
  markDirectConversationRead,
  previewTextForDirectMessageTail,
  type DirectMessage,
} from '../lib/messenger'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import { DM_PAGE_SIZE, MARK_DIRECT_READ_DEBOUNCE_MS, sortDirectMessagesChrono } from '../lib/messengerDashboardUtils'
import { playMessageSound } from '../lib/messengerSound'
import { getBackendSocket, refreshBackendSocketAuth } from '../lib/backend/socket'

/**
 * Realtime по открытому direct-треду: INSERT/DELETE/UPDATE в chat_messages, звук, ресинк при ошибке канала.
 */
export function useMessengerDirectThreadRealtime(opts: {
  userId: string | undefined
  /** id из маршрута (?chat / сегмент): подписка живёт и до готовности VM, не через «active» страницы. */
  threadConversationId: string
  listOnlyMobile: boolean
  itemsRef: MutableRefObject<MessengerConversationSummary[]>
  setItems: Dispatch<SetStateAction<MessengerConversationSummary[]>>
  setActiveConversation: Dispatch<SetStateAction<MessengerConversationSummary | null>>
  setMessages: Dispatch<SetStateAction<DirectMessage[]>>
  bumpScrollIfPinned: () => void
  mergeLatestPageIntoMessages: (convId: string, page: DirectMessage[]) => void
  mutedConversationIdsRef: MutableRefObject<Set<string>>
  reactionDeleteSidebarSyncedRef: MutableRefObject<Set<string>>
}): void {
  const {
    userId,
    threadConversationId,
    listOnlyMobile,
    itemsRef,
    setItems,
    setActiveConversation,
    setMessages,
    bumpScrollIfPinned,
    mergeLatestPageIntoMessages,
    mutedConversationIdsRef,
    reactionDeleteSidebarSyncedRef,
  } = opts

  useEffect(() => {
    const uid = userId
    const convId = threadConversationId.trim()
    if (!uid || !convId || listOnlyMobile) return
    const kind = itemsRef.current.find((i) => i.id === convId)?.kind ?? 'direct'
    if (kind !== 'direct') return

    let markReadDebounce: ReturnType<typeof setTimeout> | null = null
    const scheduleMarkRead = () => {
      if (markReadDebounce != null) clearTimeout(markReadDebounce)
      markReadDebounce = setTimeout(() => {
        markReadDebounce = null
        void markDirectConversationRead(convId)
      }, MARK_DIRECT_READ_DEBOUNCE_MS)
    }

    const bumpSidebarForInsert = (msg: DirectMessage) => {
      if (msg.kind === 'reaction') return
      const preview = previewTextForDirectMessageTail(msg)
      const fromPeer = msg.senderUserId !== uid
      /** В открытом ЛС входящие уже «увидены» в ленте — не копим unread локально. */
      setItems((prev) =>
        prev.map((item) =>
          item.id === convId
            ? {
                ...item,
                lastMessageAt: msg.createdAt,
                lastMessagePreview: preview,
                messageCount: item.messageCount + 1,
                unreadCount: fromPeer ? 0 : item.unreadCount,
              }
            : item,
        ),
      )
      setActiveConversation((prev) =>
        prev && prev.id === convId
          ? {
              ...prev,
              lastMessageAt: msg.createdAt,
              lastMessagePreview: preview,
              messageCount: prev.messageCount + 1,
              unreadCount: fromPeer ? 0 : prev.unreadCount,
            }
          : prev,
      )
    }

    refreshBackendSocketAuth()
    const socket = getBackendSocket()
    const room = `dm:${convId}`

    const onNew = (payload: { conversationId: string; message: any }) => {
      if (payload.conversationId !== convId) return
      const row = payload.message as Record<string, unknown>
      if (!row?.id) return
      const msg = mapDirectMessageFromRow({
        id: row.id,
        sender_user_id: row.senderUserId,
        sender_name_snapshot: row.senderNameSnapshot,
        kind: row.kind,
        body: row.body,
        meta: row.meta,
        created_at: row.createdAt,
        edited_at: row.editedAt,
        reply_to_message_id: row.replyToMessageId,
      })

      const isOwn = msg.senderUserId === uid
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        const next = [...prev, msg]
        next.sort(sortDirectMessagesChrono)
        return next
      })
      queueMicrotask(() => bumpScrollIfPinned())
      bumpSidebarForInsert(msg)
      if (!isOwn) scheduleMarkRead()
      if (!isOwn && document.hidden && !mutedConversationIdsRef.current.has(convId) && msg.kind !== 'reaction') {
        playMessageSound()
      }
    }

    socket.on('dm:message:new', onNew)
    socket.emit('room:join', { room })

    return () => {
      if (markReadDebounce != null) clearTimeout(markReadDebounce)
      socket.off('dm:message:new', onNew)
      socket.emit('room:leave', { room })
    }
  }, [threadConversationId, listOnlyMobile, userId, bumpScrollIfPinned, mergeLatestPageIntoMessages])
}
