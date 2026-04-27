import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { MessengerConversationSummary } from '../lib/messengerConversations'

/**
 * Список чатов плюс временные строки для заявок на вступление; при появлении чата в `items` заглушка убирается.
 */
export function useMessengerSidebarMergedItems(
  items: MessengerConversationSummary[],
  pendingJoinSidebarById: Record<string, MessengerConversationSummary>,
  setPendingJoinSidebarById: Dispatch<
    SetStateAction<Record<string, MessengerConversationSummary>>
  >,
): {
  mergedItems: MessengerConversationSummary[]
  mergedItemsRef: MutableRefObject<MessengerConversationSummary[]>
} {
  const mergedItems = useMemo(() => {
    // Invariant for the sidebar UI: one row per conversation id.
    // If backend or async refresh briefly returns duplicates, normalize them here to avoid React key spam.
    const byId = new Map<string, MessengerConversationSummary>()
    const dupCounts = new Map<string, number>()
    for (const it of items) {
      const id = (it.id || '').trim()
      if (!id) continue
      const prev = byId.get(id)
      if (!prev) {
        byId.set(id, it)
        dupCounts.set(id, 1)
        continue
      }
      dupCounts.set(id, (dupCounts.get(id) ?? 1) + 1)
      const prevTs = new Date(prev.lastMessageAt ?? prev.createdAt).getTime()
      const nextTs = new Date(it.lastMessageAt ?? it.createdAt).getTime()
      byId.set(id, Number.isFinite(nextTs) && (!Number.isFinite(prevTs) || nextTs >= prevTs) ? it : prev)
    }
    if (import.meta.env.DEV) {
      const dups = Array.from(dupCounts.entries()).filter(([, n]) => n > 1)
      if (dups.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('messenger.sidebar: duplicate conversation ids from items', dups.slice(0, 10))
      }
    }

    const out = Array.from(byId.values())
    const ids = new Set(out.map((i) => i.id))
    for (const stub of Object.values(pendingJoinSidebarById)) {
      if (!ids.has(stub.id)) out.push(stub)
    }
    return out
  }, [items, pendingJoinSidebarById])

  const mergedItemsRef = useRef(mergedItems)
  mergedItemsRef.current = mergedItems

  useEffect(() => {
    setPendingJoinSidebarById((prev) => {
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(prev)) {
        if (items.some((i) => i.id === id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [items, setPendingJoinSidebarById])

  return { mergedItems, mergedItemsRef }
}
