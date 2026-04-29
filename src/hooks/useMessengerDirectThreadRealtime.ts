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
import { subscribeThread } from '../api/messengerRealtime'
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

    const disableWs = String(import.meta.env.VITE_MESSENGER_DISABLE_WS ?? '').trim() === '1'

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

    if (disableWs) {
      // HTTP polling fallback: periodically fetch latest page and merge into local state.
      let destroyed = false
      let pollInFlight = false

      const pollOnce = async () => {
        if (destroyed || pollInFlight) return
        pollInFlight = true
        try {
          const page = await listDirectMessagesPage(convId, { limit: DM_PAGE_SIZE })
          if (destroyed) return
          if (page.error || !page.data) return
          const nextPage = page.data

          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id))
            const appended = nextPage.filter((m) => !seen.has(m.id))
            if (appended.length === 0) return prev
            const next = [...prev, ...appended]
            next.sort(sortDirectMessagesChrono)

            // Best-effort sidebar + notifications based on new tail messages.
            for (const m of appended) {
              const isOwn = m.senderUserId === uid
              const skipSidebarBump =
                isOwn && (m.kind === 'text' || m.kind === 'image' || m.kind === 'audio')
              if (!skipSidebarBump) bumpSidebarForInsert(m)
              if (!isOwn) scheduleMarkRead()
              if (!isOwn && document.hidden && !mutedConversationIdsRef.current.has(convId)) {
                playMessageSound()
              }
            }

            queueMicrotask(() => bumpScrollIfPinned())
            return next
          })
        } finally {
          pollInFlight = false
        }
      }

      // Fast first run then steady polling.
      void pollOnce()
      const id = window.setInterval(() => void pollOnce(), 3000)

      return () => {
        destroyed = true
        if (markReadDebounce != null) clearTimeout(markReadDebounce)
        window.clearInterval(id)
      }
    }

    const off = subscribeThread(convId, (ev) => {
      if (ev.type === 'message_created') {
        const msg = ev.message as any as DirectMessage
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
        return
      }
      if (ev.type === 'message_deleted') {
        const id = ev.messageId
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
        return
      }
      if (ev.type === 'message_updated') {
        const msg = ev.message as any as DirectMessage
        if (!msg?.id) return
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
        queueMicrotask(() => bumpScrollIfPinned())
      }
    })

    return () => {
      if (markReadDebounce != null) clearTimeout(markReadDebounce)
      off()
    }
  }, [threadConversationId, listOnlyMobile, userId, bumpScrollIfPinned, mergeLatestPageIntoMessages])
}
