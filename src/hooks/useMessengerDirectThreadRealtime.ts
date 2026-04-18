import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  listDirectMessagesPage,
  mapDirectMessageFromRow,
  markDirectConversationRead,
  previewTextForDirectMessageTail,
  type DirectMessage,
} from '../lib/messenger'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import {
  DM_PAGE_SIZE,
  MARK_DIRECT_READ_DEBOUNCE_MS,
  sortDirectMessagesChrono,
} from '../lib/messengerDashboardUtils'
import { playMessageSound } from '../lib/messengerSound'
import { supabase } from '../lib/supabase'

/**
 * Realtime по открытому direct-треду: INSERT/DELETE/UPDATE в chat_messages, mark read, звук, ресинк при ошибке канала.
 */
export function useMessengerDirectThreadRealtime(opts: {
  userId: string | undefined
  activeConversationId: string
  listOnlyMobile: boolean
  itemsRef: MutableRefObject<MessengerConversationSummary[]>
  setItems: Dispatch<SetStateAction<MessengerConversationSummary[]>>
  setActiveConversation: Dispatch<SetStateAction<MessengerConversationSummary | null>>
  setMessages: Dispatch<SetStateAction<DirectMessage[]>>
  bumpScrollIfPinned: () => void
  mergeLatestPageIntoMessages: (convId: string, page: DirectMessage[]) => void
  markReadDebounceTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  mutedConversationIdsRef: MutableRefObject<Set<string>>
  reactionDeleteSidebarSyncedRef: MutableRefObject<Set<string>>
}): void {
  const {
    userId,
    activeConversationId,
    listOnlyMobile,
    itemsRef,
    setItems,
    setActiveConversation,
    setMessages,
    bumpScrollIfPinned,
    mergeLatestPageIntoMessages,
    markReadDebounceTimerRef,
    mutedConversationIdsRef,
    reactionDeleteSidebarSyncedRef,
  } = opts

  useEffect(() => {
    const uid = userId
    const convId = activeConversationId
    if (!uid || !convId || listOnlyMobile) return
    const kind = itemsRef.current.find((i) => i.id === convId)?.kind ?? 'direct'
    if (kind !== 'direct') return

    let sawSubscribed = false

    const bumpSidebarForInsert = (msg: DirectMessage) => {
      if (msg.kind === 'reaction') {
        setItems((prev) =>
          prev.map((item) =>
            item.id === convId
              ? {
                  ...item,
                  lastMessageAt: msg.createdAt,
                  messageCount: item.messageCount + 1,
                  unreadCount: 0,
                }
              : item,
          ),
        )
        setActiveConversation((prev) =>
          prev && prev.id === convId
            ? {
                ...prev,
                lastMessageAt: msg.createdAt,
                messageCount: prev.messageCount + 1,
                unreadCount: 0,
              }
            : prev,
        )
        return
      }
      const preview = previewTextForDirectMessageTail(msg)
      setItems((prev) =>
        prev.map((item) =>
          item.id === convId
            ? {
                ...item,
                lastMessageAt: msg.createdAt,
                lastMessagePreview: preview,
                messageCount: item.messageCount + 1,
                unreadCount: 0,
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
              unreadCount: 0,
            }
          : prev,
      )
    }

    const channel = supabase
      .channel(`dm-thread:${convId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id) return
          const msg = mapDirectMessageFromRow(row)
          const isOwn = msg.senderUserId === uid
          const skipSidebarBump = isOwn && (msg.kind === 'text' || msg.kind === 'reaction' || msg.kind === 'image')

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            let base = prev
            if (isOwn) {
              const i = prev.findIndex(
                (m) =>
                  m.id.startsWith('local-') &&
                  m.senderUserId === msg.senderUserId &&
                  m.body === msg.body &&
                  m.kind === msg.kind &&
                  (m.meta?.react_to ?? '') === (msg.meta?.react_to ?? '') &&
                  (m.replyToMessageId ?? '') === (msg.replyToMessageId ?? '') &&
                  JSON.stringify(m.meta ?? null) === JSON.stringify(msg.meta ?? null),
              )
              if (i !== -1) base = [...prev.slice(0, i), ...prev.slice(i + 1)]
            }
            const next = [...base, msg]
            next.sort(sortDirectMessagesChrono)
            return next
          })

          queueMicrotask(() => bumpScrollIfPinned())

          if (!skipSidebarBump) bumpSidebarForInsert(msg)
          if (!isOwn) {
            if (markReadDebounceTimerRef.current) clearTimeout(markReadDebounceTimerRef.current)
            markReadDebounceTimerRef.current = setTimeout(() => {
              markReadDebounceTimerRef.current = null
              void markDirectConversationRead(convId)
            }, MARK_DIRECT_READ_DEBOUNCE_MS)
            if (document.hidden && !mutedConversationIdsRef.current.has(convId)) playMessageSound()
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
        (payload) => {
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
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id) return
          const msg = mapDirectMessageFromRow(row)
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
          queueMicrotask(() => bumpScrollIfPinned())
        },
      )
      .subscribe((status) => {
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
      if (markReadDebounceTimerRef.current) {
        clearTimeout(markReadDebounceTimerRef.current)
        markReadDebounceTimerRef.current = null
        void markDirectConversationRead(convId)
      }
      void supabase.removeChannel(channel)
    }
  }, [activeConversationId, listOnlyMobile, userId, bumpScrollIfPinned, mergeLatestPageIntoMessages])
}
