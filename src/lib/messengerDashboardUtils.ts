import { previewTextForDirectMessageTail, type DirectMessage } from './messenger'
import type { ConversationMemberRow } from './conversationMembers'
import type { MessengerConversationSummary } from './messengerConversations'
import type { ReactionEmoji } from '../types/roomComms'

/** Роли, которым доступна очередь запросов на вступление в группу/канал. */
export const MESSENGER_JOIN_REQUEST_MANAGER_ROLES = new Set(['owner', 'admin', 'moderator'])

export function formatDateTime(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Время в строке списка чатов: сегодня — только часы, иначе короткая дата + время. */
export function formatMessengerListRowTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const now = new Date()
  const sameDay =
    dt.getDate() === now.getDate() &&
    dt.getMonth() === now.getMonth() &&
    dt.getFullYear() === now.getFullYear()
  if (sameDay) {
    return dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return dt.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function conversationInitial(title: string): string {
  return (title.trim().charAt(0) || 'С').toUpperCase()
}

export const MESSENGER_LAST_OPEN_KEY = 'vmix.messenger.lastOpenConversation'
export const DM_PAGE_SIZE = 50
/** Лимит размера фото в мессенджере (клиент). */
export const MESSENGER_PHOTO_MAX_BYTES = 2 * 1024 * 1024
/** Ниже этой дистанции от низа считаем, что пользователь «на хвосте» — догоняем при подгрузке картинок и т.п. */
export const MESSENGER_BOTTOM_PIN_PX = 200
/** Сжимаем частые mark read при пачке входящих в открытом треде. */
export const MARK_DIRECT_READ_DEBOUNCE_MS = 400

export function sortDirectMessagesChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

export function sortConversationsByActivity(list: MessengerConversationSummary[]): MessengerConversationSummary[] {
  return [...list].sort((a, b) => {
    const aTs = new Date(a.lastMessageAt ?? a.createdAt).getTime()
    const bTs = new Date(b.lastMessageAt ?? b.createdAt).getTime()
    return bTs - aTs
  })
}

export function normalizeMessengerListSearch(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function itemMatchesMessengerListSearch(item: MessengerConversationSummary, needle: string): boolean {
  if (!needle) return true
  const title = item.title.toLowerCase()
  const preview = (item.lastMessagePreview ?? '').toLowerCase()
  return title.includes(needle) || preview.includes(needle)
}

export function memberKickAllowed(
  callerRole: string | null,
  myUserId: string | null,
  m: ConversationMemberRow,
): boolean {
  if (!myUserId || m.userId === myUserId) return false
  if (m.role === 'owner') return false
  if (callerRole === 'owner') return true
  if (callerRole === 'admin') return m.role === 'member' || m.role === 'moderator'
  return false
}

/** Последнее text/system в треде — для превью в списке (реакции не считаются «последним сообщением»). */
export function lastNonReactionBody(rows: DirectMessage[]): string | null {
  const sorted = [...rows].sort(sortDirectMessagesChrono)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i]!
    if (m.kind === 'text' || m.kind === 'system') return m.body
    if (m.kind === 'image') return previewTextForDirectMessageTail(m)
  }
  return null
}

/** URL пустой: последний открытый диалог из localStorage, иначе самый свежий по активности, иначе запасной id (напр. «с собой»). */
export function pickDefaultConversationId(
  list: MessengerConversationSummary[],
  fallbackId: string | null,
): string {
  if (list.length === 0) return fallbackId?.trim() || ''
  try {
    const stored = localStorage.getItem(MESSENGER_LAST_OPEN_KEY)?.trim()
    if (stored && list.some((i) => i.id === stored)) return stored
  } catch {
    /* ignore */
  }
  const sorted = sortConversationsByActivity(list)
  return sorted[0]?.id || fallbackId?.trim() || ''
}

export const LIGHTBOX_SWIPE_CLOSE_PX = 52

/** Двойной тап / двойной клик по пузырю: «лайк», не 👍. */
export const QUICK_REACTION_EMOJI: ReactionEmoji = '❤️'

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const v = text ?? ''
  if (!v) return false
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(v)
      return true
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = v
    ta.setAttribute('readonly', 'true')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export function messengerStaffRoleShortLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'админ'
    case 'moderator':
      return 'модератор'
    default:
      return 'участник'
  }
}
