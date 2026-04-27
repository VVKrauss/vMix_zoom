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
import { rtChannel, rtRemoveChannel } from '../api/realtimeCompat'
import { optimisticMessageMatches } from '../lib/messengerOptimisticMatch'

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

    let sawSubscribed = false
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

    const channel = rtChannel(`dm-thread:${convId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload: any) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id) return
          const msg = mapDirectMessageFromRow(row)
          const isOwn = msg.senderUserId === uid
          const skipSidebarBump =
            isOwn && (msg.kind === 'text' || msg.kind === 'reaction' || msg.kind === 'image' || msg.kind === 'audio')

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            let base = prev
            if (isOwn) {
              const i = (() => {
                for (let j = 0; j < prev.length; j += 1) {
                  const m = prev[j]!
                  if (!m.id.startsWith('local-') || m.senderUserId !== msg.senderUserId) continue
                  if (optimisticMessageMatches(m, msg, { senderId: uid })) return j
                }
                return -1
              })()
              if (i !== -1) base = [...prev.slice(0, i), ...prev.slice(i + 1)]
            }
            const next = [...base, msg]
            next.sort(sortDirectMessagesChrono)
            return next
          })

          queueMicrotask(() => bumpScrollIfPinned())

          if (!skipSidebarBump && msg.kind !== 'reaction') {
            bumpSidebarForInsert(msg)
            if (!isOwn) scheduleMarkRead()
          }
          if (
            !isOwn &&
            document.hidden &&
            !mutedConversationIdsRef.current.has(convId) &&
            msg.kind !== 'reaction'
          ) {
            playMessageSound()
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload: any) => {
          const oldRow = payload.old as Record<string, unknown>
          const id = typeof oldRow?.id === 'string' ? oldRow.id : ''
          if (!id) return

          setMessages((prev) => prev.filter((m) => m.id !== id))

          if (reactionDeleteSidebarSyncedRef.current.has(id)) {
            reactionDeleteSidebarSyncedRef.current.delete(id)
            return
          }

          setItems((prev) =>
            prev.map((item) =>
              item.id === convId
                ? { ...item, messageCount: Math.max(0, item.messageCount - 1) }
                : item,
            ),
          )
          setActiveConversation((prev) =>
            prev && prev.id === convId
              ? { ...prev, messageCount: Math.max(0, prev.messageCount - 1) }
              : prev,
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload: any) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id) return
          const msg = mapDirectMessageFromRow(row)
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
          queueMicrotask(() => bumpScrollIfPinned())
        },
      )
      .subscribe((status: any) => {
        if (status === 'SUBSCRIBED') {
          sawSubscribed = true
          return
        }
        if (!sawSubscribed || (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT')) return
        void (async () => {
          const res = await listDirectMessagesPage(convId, { limit: DM_PAGE_SIZE })
          if (res.error || !res.data?.length) return
          mergeLatestPageIntoMessages(convId, res.data)
          bumpScrollIfPinned()
        })()
      })

    return () => {
      if (markReadDebounce != null) clearTimeout(markReadDebounce)
      rtRemoveChannel(channel)
    }
  }, [threadConversationId, listOnlyMobile, userId, bumpScrollIfPinned, mergeLatestPageIntoMessages])
}
