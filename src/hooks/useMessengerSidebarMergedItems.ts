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
    const out = [...items]
    const ids = new Set(items.map((i) => i.id))
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
