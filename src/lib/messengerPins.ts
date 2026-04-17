import type { MessengerConversationSummary } from './messengerConversations'
import { sortConversationsByActivity } from './messengerDashboardUtils'

const STORAGE_KEY = 'vmix.messenger.pinnedChatIds'
export const MESSENGER_MAX_PINNED_CHATS = 3

/** Нормализация массива id из БД / localStorage. */
export function normalizeMessengerPinnedIds(raw: unknown): string[] {
  if (raw == null) return []
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const t = x.trim()
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= MESSENGER_MAX_PINNED_CHATS) break
  }
  return out
}

export function readMessengerPinnedChatIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const v = JSON.parse(raw) as unknown
    return normalizeMessengerPinnedIds(v)
  } catch {
    return []
  }
}

export function writeMessengerPinnedChatIds(ids: string[]): void {
  if (typeof window === 'undefined') return
  const next = normalizeMessengerPinnedIds(ids)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

/**
 * - Поле отсутствует в ответе (`undefined`) — только legacy localStorage.
 * - Сервер отдал непустой список — он главный (другие устройства).
 * - Сервер пустой (`[]` / null), а в localStorage ещё есть закрепы — не затираем:
 *   иначе после F5 теряются закрепы, пока debounced save не успел в БД или update молча упал.
 */
export function resolveMessengerPinnedChatsForHydration(serverRaw: unknown | undefined): string[] {
  if (serverRaw === undefined) return readMessengerPinnedChatIds()
  const fromServer = normalizeMessengerPinnedIds(serverRaw)
  if (fromServer.length > 0) return fromServer
  const local = readMessengerPinnedChatIds()
  return local.length > 0 ? local : fromServer
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
