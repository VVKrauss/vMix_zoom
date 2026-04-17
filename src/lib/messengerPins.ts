import type { MessengerConversationSummary } from './messengerConversations'
import { sortConversationsByActivity } from './messengerDashboardUtils'

const STORAGE_KEY = 'vmix.messenger.pinnedChatIds'
export const MESSENGER_MAX_PINNED_CHATS = 3

function parseIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    const out: string[] = []
    for (const x of v) {
      if (typeof x !== 'string') continue
      const t = x.trim()
      if (t && !out.includes(t)) out.push(t)
      if (out.length >= MESSENGER_MAX_PINNED_CHATS) break
    }
    return out
  } catch {
    return []
  }
}

export function readMessengerPinnedChatIds(): string[] {
  if (typeof window === 'undefined') return []
  return parseIds(window.localStorage.getItem(STORAGE_KEY))
}

export function writeMessengerPinnedChatIds(ids: string[]): void {
  if (typeof window === 'undefined') return
  const next = ids
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .slice(0, MESSENGER_MAX_PINNED_CHATS)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

/** Сначала закреплённые (в порядке pin), затем остальные по активности. */
export function sortMessengerListWithPins(
  list: MessengerConversationSummary[],
  pinnedIds: string[],
): MessengerConversationSummary[] {
  const pinOrder = pinnedIds.map((x) => x.trim()).filter(Boolean)
  const pinSet = new Set(pinOrder)
  const pinned: MessengerConversationSummary[] = []
  for (const id of pinOrder) {
    const row = list.find((i) => i.id === id)
    if (row) pinned.push(row)
  }
  const rest = sortConversationsByActivity(list.filter((i) => !pinSet.has(i.id)))
  return [...pinned, ...rest]
}
