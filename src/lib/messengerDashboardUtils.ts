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

/** Сколько календарных дней дата `dt` раньше `ref` (0 — тот же день, 1 — вчера). */
function calendarDaysAgo(dt: Date, ref: Date): number {
  const a = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime()
  const b = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * Время в строке списка чатов: сегодня — только время; вчера / позавчера — слова;
 * с третьего дня назад — только дата (число и месяц).
 */
export function formatMessengerListRowTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const now = new Date()
  const daysAgo = calendarDaysAgo(dt, now)
  if (daysAgo < 0) {
    return dt.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  if (daysAgo === 0) {
    return dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  if (daysAgo === 1) return 'вчера'
  if (daysAgo === 2) return 'позавчера'
  const sameYear = dt.getFullYear() === now.getFullYear()
  return dt.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  })
}

export function conversationInitial(title: string): string {
  return (title.trim().charAt(0) || 'С').toUpperCase()
}

export const MESSENGER_LAST_OPEN_KEY = 'vmix.messenger.lastOpenConversation'
export const DM_PAGE_SIZE = 50
/** Лимит размера фото в мессенджере (клиент). */
export const MESSENGER_PHOTO_MAX_BYTES = 2 * 1024 * 1024
/** Макс. число фото в одном сообщении (галерея). */
export const MESSENGER_GALLERY_MAX_ATTACH = 10
/** Ниже этой дистанции от низа считаем, что пользователь «на хвосте» — догоняем при подгрузке картинок и т.п. */
export const MESSENGER_BOTTOM_PIN_PX = 200
/** Сжимаем частые mark read при пачке входящих в открытом треде. */
export const MARK_DIRECT_READ_DEBOUNCE_MS = 400

export type BuildMessengerUrlShare = {
  /** id сообщения / поста — скролл к нему при открытии ссылки */
  messageId?: string
  /** id поста-родителя — для комментария: открыть модалку комментариев и проскроллить к комментарию */
  parentMessageId?: string
}

/** Путь `/dashboard/messenger` с query `chat` / `with` / `title` / `msg` / `post`. */
export function buildMessengerUrl(
  chatId?: string,
  withUserId?: string,
  withTitle?: string,
  share?: BuildMessengerUrlShare,
): string {
  const params = new URLSearchParams()
  if (chatId) params.set('chat', chatId)
  if (withUserId) params.set('with', withUserId)
  if (withTitle) params.set('title', withTitle)
  const mid = share?.messageId?.trim()
  const pid = share?.parentMessageId?.trim()
  if (mid) params.set('msg', mid)
  if (pid) params.set('post', pid)
  const qs = params.toString()
  return qs ? `/dashboard/messenger?${qs}` : '/dashboard/messenger'
}

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

/** Ведущий @ убираем: поиск по «@slug» совпадает с «slug». */
export function stripLeadingAtForSearch(raw: string): string {
  let t = raw.trim()
  while (t.startsWith('@')) t = t.slice(1).trim()
  return t
}

export function normalizeMessengerListSearch(raw: string): string {
  return stripLeadingAtForSearch(raw).toLowerCase().replace(/\s+/g, ' ')
}

export function itemMatchesMessengerListSearch(item: MessengerConversationSummary, needle: string): boolean {
  if (!needle) return true
  const title = item.title.toLowerCase()
  const preview = (item.lastMessagePreview ?? '').toLowerCase()
  const nick = (item.publicNick ?? '').toLowerCase()
  if (title.includes(needle) || preview.includes(needle)) return true
  if (nick && (nick.includes(needle) || `@${nick}`.includes(needle))) return true
  return false
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

function coerceClipboardFileToImage(f: File): File | null {
  if (!f?.size) return null
  const t = (f.type || '').toLowerCase()
  // На iOS в буфере часто приходит HEIC/HEIF или другие image/* типы.
  // Мы в любом случае пережимаем в JPEG при загрузке, поэтому принимаем любой image/*.
  if (t.startsWith('image/')) return f
  if (!t) {
    const next = new File([f], 'clipboard.png', { type: 'image/png' })
    return next.type.toLowerCase().startsWith('image/') ? next : null
  }
  return null
}

/**
 * Файл картинки из события paste (DataTransfer).
 * Учитывает clipboardData.files (Android/Chrome), items + getAsFile (в т.ч. Safari iOS).
 */
export function extractClipboardImageFile(dt: DataTransfer | null): File | null {
  const all = extractClipboardImageFiles(dt)
  return all[0] ?? null
}

/** Все картинки из буфера (множественная вставка). */
export function extractClipboardImageFiles(dt: DataTransfer | null): File[] {
  if (!dt) return []

  const out: File[] = []
  const fromFileList = (list: FileList | null | undefined) => {
    if (!list?.length) return
    for (let i = 0; i < list.length; i++) {
      const coerced = coerceClipboardFileToImage(list[i]!)
      if (coerced) out.push(coerced)
    }
  }
  fromFileList(dt.files)
  if (out.length > 0) return out

  const items = dt.items
  if (!items?.length) return []

  for (const it of Array.from(items)) {
    const t = (it.type || '').toLowerCase()
    if (it.kind === 'file' || t.startsWith('image/')) {
      if (t && !t.startsWith('image/')) continue
      const f = it.getAsFile()
      const coerced = f ? coerceClipboardFileToImage(f) : null
      if (coerced) out.push(coerced)
    }
  }
  return out
}

/**
 * Чтение картинки через Clipboard API (удобно на мобильных, когда paste в textarea не отдаёт файлы).
 * Нужен жест пользователя (кнопка). Secure context.
 */
export async function readClipboardImageFileFromClipboardApi(): Promise<File | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.read) return null
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      for (const type of item.types) {
        if (!type.toLowerCase().startsWith('image/')) continue
        const blob = await item.getType(type)
        if (!blob?.size) continue
        const ext = type.split('/')[1]?.split('+')[0] || 'png'
        const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'png'
        const f = new File([blob], `clipboard.${safeExt}`, { type })
        return coerceClipboardFileToImage(f)
      }
    }
  } catch {
    return null
  }
  return null
}
