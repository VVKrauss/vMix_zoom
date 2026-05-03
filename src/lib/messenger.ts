import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { isPostDraftV1 } from './postEditor/draftUtils'
import type { PostDraftV1 } from './postEditor/types'
import { supabase } from './supabase'
import { normalizeSupabaseStoragePublicUrl } from './supabaseStorageUrl'

/** Событие для мгновенного пересчёта бейджа непрочитанных (см. useMessengerUnreadCount). */
export const MESSENGER_UNREAD_REFRESH_EVENT = 'vmix:messenger-unread-refresh'

/** Список чатов должен подтянуть локальные имена контактов (алиасы). */
export const MESSENGER_CONTACT_ALIAS_CHANGED_EVENT = 'vmix:messenger-contact-alias-changed'

export function requestMessengerUnreadRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MESSENGER_UNREAD_REFRESH_EVENT))
}

export function requestMessengerContactAliasRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MESSENGER_CONTACT_ALIAS_CHANGED_EVENT))
}

export type DirectConversationSummary = {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
  unreadCount: number
  otherUserId: string | null
  avatarUrl: string | null
}

export type DirectMessageKind = 'text' | 'system' | 'reaction' | 'image' | 'audio'

/** Снимок цитируемого сообщения на момент отправки (reply_preview в БД). */
export type MessengerReplyPreviewStored = {
  kind: Extract<DirectMessageKind, 'text' | 'image' | 'audio' | 'system'>
  snippet: string
  senderName: string
  senderUserId: string | null
  thumbPath?: string
}

/** Локальный снимок для optimistic-сообщений (совместим с серверным reply_preview). */
export function messengerReplyPreviewStoredFromMessage(parent: DirectMessage): MessengerReplyPreviewStored | null {
  if (!parent?.id || parent.kind === 'reaction') return null
  const k = parent.kind
  if (k !== 'text' && k !== 'image' && k !== 'audio' && k !== 'system') return null

  const raw = previewTextForDirectMessageTail(parent).replace(/\s+/g, ' ').trim()
  const snippet = (raw.length > 280 ? raw.slice(0, 280) : raw) || '…'

  let thumbPath: string | undefined
  if (k === 'image') {
    const tp =
      parent.meta?.image?.thumbPath?.trim() ||
      parent.meta?.image?.path?.trim() ||
      (Array.isArray(parent.meta?.images) && parent.meta!.images!.length > 0
        ? parent.meta!.images![0]!.thumbPath?.trim() || parent.meta!.images![0]!.path?.trim()
        : '')
    thumbPath = tp || undefined
  }

  const senderName = parent.senderNameSnapshot?.trim() || '…'

  return {
    kind: k,
    snippet,
    senderName,
    senderUserId: parent.senderUserId ?? null,
    ...(thumbPath ? { thumbPath } : {}),
  }
}

function mapReplyPreviewFromRow(row: Record<string, unknown>): MessengerReplyPreviewStored | null {
  const raw = row.reply_preview
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const kindRaw = typeof o.kind === 'string' ? o.kind : ''
  const kind =
    kindRaw === 'text' || kindRaw === 'image' || kindRaw === 'audio' || kindRaw === 'system' ? kindRaw : null
  if (!kind) return null
  const snippet =
    typeof o.snippet === 'string' && o.snippet.trim() ? o.snippet.trim().slice(0, 280) : '…'
  const senderName =
    typeof o.sender_name === 'string' && o.sender_name.trim() ? o.sender_name.trim().slice(0, 200) : '…'
  let senderUserId: string | null = null
  if (typeof o.sender_user_id === 'string' && o.sender_user_id.trim()) senderUserId = o.sender_user_id.trim()
  const thumbPath =
    typeof o.thumb_path === 'string' && o.thumb_path.trim() ? o.thumb_path.trim() : undefined
  return {
    kind,
    snippet,
    senderName,
    senderUserId,
    ...(thumbPath ? { thumbPath } : {}),
  }
}

/** Навигация по клику на «Переслано из …» (сохраняется в meta.forward_info). */
export type MessengerForwardNav =
  | { kind: 'channel_post'; conversationId: string; postMessageId: string }
  | { kind: 'channel_comment'; conversationId: string; postId: string; commentMessageId: string }
  | { kind: 'group_message'; conversationId: string; messageId: string }
  | { kind: 'dm_message'; conversationId: string; messageId: string }
  | { kind: 'dm_profile'; authorUserId: string }

/** Пересланное сообщение (копия): строка источника + опциональный переход. */
export type MessengerForwardInfo = {
  label: string
  /** Если true — строка скрыта, но источник остаётся в meta. */
  hidden?: boolean
  nav?: MessengerForwardNav
}

export type DirectMessage = {
  id: string
  senderUserId: string | null
  senderNameSnapshot: string
  kind: DirectMessageKind
  body: string
  createdAt: string
  editedAt?: string | null
  replyToMessageId?: string | null
  /** Отдельная ссылка на цитируемое сообщение (для channel comments: replyTo = post, quoteTo = comment). */
  quoteToMessageId?: string | null
  /** Денормализованное превью цитируемого сообщения (не зависит от загрузки родителя в ленту). */
  replyPreview?: MessengerReplyPreviewStored | null
  /**
   * Meta из базы (jsonb):
   * - reaction: react_to
   * - image: image.path/thumbPath
   * - rich: link preview (link.*)
   */
  meta?: {
    react_to?: string
    image?: { path: string; thumbPath?: string }
    /** Несколько фото в одном сообщении (meta.image при этом не используется). */
    images?: Array<{ path: string; thumbPath?: string }>
    /** Голосовое: путь в messenger-media, длительность с опционально. */
    audio?: { path: string; durationSec?: number }
    link?: { url: string; title?: string; description?: string; image?: string; siteName?: string }
    /** Редактор поста канала v1 */
    postDraft?: PostDraftV1
    /** Личка: soft-delete заменил сообщение системной заглушкой */
    deleted?: boolean
    forward_info?: MessengerForwardInfo
  } | null
}

function readForwardNavFromRecord(n: Record<string, unknown>): MessengerForwardNav | undefined {
  const kind = typeof n.kind === 'string' ? n.kind.trim() : ''
  const cid = (typeof n.conversationId === 'string' ? n.conversationId : typeof n.conversation_id === 'string' ? n.conversation_id : '')
    .trim()
  if (kind === 'channel_post') {
    const postMessageId = (
      typeof n.postMessageId === 'string' ? n.postMessageId : typeof n.post_message_id === 'string' ? n.post_message_id : ''
    ).trim()
    if (cid && postMessageId) return { kind: 'channel_post', conversationId: cid, postMessageId }
    return undefined
  }
  if (kind === 'channel_comment') {
    const postId = (typeof n.postId === 'string' ? n.postId : typeof n.post_id === 'string' ? n.post_id : '').trim()
    const commentMessageId = (
      typeof n.commentMessageId === 'string'
        ? n.commentMessageId
        : typeof n.comment_message_id === 'string'
          ? n.comment_message_id
          : ''
    ).trim()
    if (cid && postId && commentMessageId) return { kind: 'channel_comment', conversationId: cid, postId, commentMessageId }
    return undefined
  }
  if (kind === 'group_message') {
    const messageId = (typeof n.messageId === 'string' ? n.messageId : typeof n.message_id === 'string' ? n.message_id : '').trim()
    if (cid && messageId) return { kind: 'group_message', conversationId: cid, messageId }
    return undefined
  }
  if (kind === 'dm_message') {
    const messageId = (typeof n.messageId === 'string' ? n.messageId : typeof n.message_id === 'string' ? n.message_id : '').trim()
    if (cid && messageId) return { kind: 'dm_message', conversationId: cid, messageId }
    return undefined
  }
  if (kind === 'dm_profile') {
    const authorUserId = (
      typeof n.authorUserId === 'string' ? n.authorUserId : typeof n.author_user_id === 'string' ? n.author_user_id : ''
    ).trim()
    if (authorUserId) return { kind: 'dm_profile', authorUserId }
    return undefined
  }
  return undefined
}

function mapMetaFromRow(raw: unknown): DirectMessage['meta'] {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const reactTo = o.react_to
  const img = o.image
  const link = o.link
  let image: { path: string; thumbPath?: string } | undefined
  if (img && typeof img === 'object') {
    const io = img as Record<string, unknown>
    const p = io.path
    const tp = io.thumbPath ?? io.thumb_path
    if (typeof p === 'string' && p.trim()) {
      const path = p.trim()
      image =
        typeof tp === 'string' && tp.trim() ? { path, thumbPath: tp.trim() } : { path }
    }
  }
  const react = typeof reactTo === 'string' && reactTo.trim() ? reactTo.trim() : undefined
  let linkMeta:
    | { url: string; title?: string; description?: string; image?: string; siteName?: string }
    | undefined
  if (link && typeof link === 'object') {
    const lo = link as Record<string, unknown>
    const url = typeof lo.url === 'string' && lo.url.trim() ? lo.url.trim() : null
    if (url) {
      linkMeta = {
        url,
        ...(typeof lo.title === 'string' && lo.title.trim() ? { title: lo.title.trim() } : {}),
        ...(typeof lo.description === 'string' && lo.description.trim() ? { description: lo.description.trim() } : {}),
        ...(typeof lo.image === 'string' && lo.image.trim() ? { image: lo.image.trim() } : {}),
        ...(typeof lo.siteName === 'string' && lo.siteName.trim()
          ? { siteName: lo.siteName.trim() }
          : typeof lo.site_name === 'string' && lo.site_name.trim()
            ? { siteName: lo.site_name.trim() }
            : {}),
      }
    }
  }
  let postDraft: PostDraftV1 | undefined
  const pd = o.postDraft
  if (isPostDraftV1(pd)) postDraft = pd

  let audio: { path: string; durationSec?: number } | undefined
  const rawAudio = o.audio
  if (rawAudio && typeof rawAudio === 'object') {
    const ao = rawAudio as Record<string, unknown>
    const p = ao.path
    const ds = ao.duration_sec ?? ao.durationSec
    if (typeof p === 'string' && p.trim()) {
      const path = p.trim()
      const n = typeof ds === 'number' && Number.isFinite(ds) ? ds : Number(ds)
      audio =
        typeof n === 'number' && Number.isFinite(n) ? { path, durationSec: n } : { path }
    }
  }

  const deleted = o.deleted === true

  let images: Array<{ path: string; thumbPath?: string }> | undefined
  const rawImages = o.images
  if (Array.isArray(rawImages) && rawImages.length > 0) {
    const parsed: Array<{ path: string; thumbPath?: string }> = []
    for (const it of rawImages) {
      if (!it || typeof it !== 'object') continue
      const io = it as Record<string, unknown>
      const p = io.path
      const tp = io.thumbPath ?? io.thumb_path
      if (typeof p === 'string' && p.trim()) {
        const path = p.trim()
        parsed.push(
          typeof tp === 'string' && tp.trim() ? { path, thumbPath: tp.trim() } : { path },
        )
      }
    }
    if (parsed.length > 0) images = parsed
  }

  let forwardInfo: MessengerForwardInfo | undefined
  const rawForwardInfo = o.forward_info ?? o.forwardInfo
  if (rawForwardInfo && typeof rawForwardInfo === 'object') {
    const fi = rawForwardInfo as Record<string, unknown>
    const label = typeof fi.label === 'string' ? fi.label.trim() : ''
    if (label) {
      const navRaw = fi.nav
      const nav = navRaw && typeof navRaw === 'object' ? readForwardNavFromRecord(navRaw as Record<string, unknown>) : undefined
      forwardInfo = {
        label,
        ...(fi.hidden === true ? { hidden: true } : {}),
        ...(nav ? { nav } : {}),
      }
    }
  }

  if (!react && !image && !images && !linkMeta && !postDraft && !deleted && !forwardInfo && !audio) return null
  return {
    ...(deleted ? { deleted: true } : {}),
    ...(forwardInfo ? { forward_info: forwardInfo } : {}),
    ...(react ? { react_to: react } : {}),
    ...(images ? { images } : {}),
    ...(image && !images ? { image } : {}),
    ...(audio ? { audio } : {}),
    ...(linkMeta ? { link: linkMeta } : {}),
    ...(postDraft ? { postDraft } : {}),
  }
}

/** Личка: сообщение заменено заглушкой после удаления автором. */
export function isDmSoftDeletedStub(msg: Pick<DirectMessage, 'kind' | 'body' | 'meta'>): boolean {
  if (msg.kind !== 'system') return false
  if (msg.meta?.deleted === true) return true
  return /^сообщение\s+удалено$/i.test(msg.body.trim())
}

/** Строка из PostgREST / Realtime (snake_case). */
function mapMessageKind(raw: unknown): DirectMessageKind {
  if (raw === 'reaction' || raw === 'system' || raw === 'image' || raw === 'audio') return raw
  return 'text'
}

/**
 * Строка превью хвоста диалога в списке для сообщения (в т.ч. фото без подписи — имя файла или метка).
 */
export function getMessengerImageAttachments(
  msg: Pick<DirectMessage, 'kind' | 'meta'>,
): Array<{ path: string; thumbPath?: string }> {
  if (msg.kind !== 'image') return []
  const multi = msg.meta?.images
  if (Array.isArray(multi) && multi.length > 0) {
    return multi
      .map((x) => ({
        path: typeof x.path === 'string' ? x.path.trim() : '',
        ...(typeof x.thumbPath === 'string' && x.thumbPath.trim() ? { thumbPath: x.thumbPath.trim() } : {}),
      }))
      .filter((x) => x.path.length > 0)
  }
  const one = msg.meta?.image
  if (one?.path?.trim()) {
    const path = one.path.trim()
    return [{ path, ...(one.thumbPath?.trim() ? { thumbPath: one.thumbPath.trim() } : {}) }]
  }
  return []
}

export function previewTextForDirectMessageTail(msg: Pick<DirectMessage, 'kind' | 'body' | 'meta'>): string {
  if (msg.kind === 'audio') {
    const cap = msg.body.replace(/\s+/g, ' ').trim()
    if (cap) return cap
    return 'Голосовое сообщение'
  }
  if (msg.kind !== 'image') return msg.body
  const cap = msg.body.replace(/\s+/g, ' ').trim()
  const imgs = msg.meta?.images
  if (Array.isArray(imgs) && imgs.length > 1) {
    if (cap) return `${cap} (${imgs.length} фото)`
    return `${imgs.length} фото`
  }
  if (cap) return cap
  const path = msg.meta?.image?.path?.trim()
  if (path) {
    const base = path.split(/[/\\]/).pop()?.trim()
    if (base) return base
  }
  return 'Изображение'
}

/** Превью пустого треда в боковом списке (после удаления всех сообщений). */
export const MESSENGER_EMPTY_THREAD_LIST_PREVIEW = 'Нет сообщений'

function sortMessagesChronoForListTail(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a.id.localeCompare(b.id)
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

/** Хвост для строки списка чатов: последнее не-reaction сообщение или плейсхолдер. */
export function messengerConversationListTailPatch(messages: DirectMessage[]): {
  lastMessageAt: string
  lastMessagePreview: string
} {
  const visible = messages.filter((m) => m.kind !== 'reaction')
  if (visible.length === 0) {
    return {
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: MESSENGER_EMPTY_THREAD_LIST_PREVIEW,
    }
  }
  const sorted = [...visible].sort(sortMessagesChronoForListTail)
  const tail = sorted[sorted.length - 1]!
  return {
    lastMessageAt: tail.createdAt,
    lastMessagePreview: previewTextForDirectMessageTail(tail),
  }
}

/** Превью в списке чатов для голосовых (сервер: «🎤 Голосовое» или подпись из body). */
export function shouldShowVoiceMessageListIcon(preview: string | null | undefined): boolean {
  const t = preview?.trim() ?? ''
  if (!t) return false
  if (/^\s*🎤/u.test(t)) return true
  return t === 'Голосовое' || t === '🎤 Голосовое' || t === 'Голосовое сообщение'
}

export function voiceMessageListPreviewLabel(preview: string): string {
  const s = preview.replace(/^\s*🎤\s*/u, '').trim()
  return s || 'Голосовое'
}

/** Контекст ЛС для индикаторов исходящих: курсор прочтения собеседника и его флаг приватности квитанций. */
export type DirectPeerDmReceiptContext = {
  lastReadAt: string | null
  /** См. RPC `get_direct_peer_read_receipt_context` (чтение чужого users с клиента ненадёжно из‑за RLS). */
  peerReceiptsPrivate: boolean
}

/** Берём более поздний курсор (realtime / fetch / poll не должны откатывать время назад). */
export function mergePeerLastReadAt(prev: string | null, next: string | null): string | null {
  if (!next?.trim()) return prev ?? null
  if (!prev?.trim()) return next
  const nt = new Date(next).getTime()
  const pt = new Date(prev).getTime()
  if (!Number.isFinite(nt)) return prev
  if (!Number.isFinite(pt)) return next
  return nt >= pt ? next : prev
}

function parseUnknownTimestampToIso(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const t = Date.parse(v)
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  }
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString()
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    if ('value' in o) return parseUnknownTimestampToIso(o.value)
    if ('toString' in o && typeof (o as { toString: () => string }).toString === 'function') {
      const s = String((o as { toString: () => string }).toString())
      const t = Date.parse(s)
      if (Number.isFinite(t)) return new Date(t).toISOString()
    }
  }
  return null
}

function unwrapRpcJsonData(data: unknown): unknown {
  if (data == null) return null
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as unknown
    } catch {
      return null
    }
  }
  return data
}

async function fetchDirectPeerDmReceiptContextMembersOnly(
  conversationId: string,
  uid: string,
): Promise<{ data: DirectPeerDmReceiptContext | null; error: string | null }> {
  const cid = conversationId.trim()
  const { data, error } = await supabase
    .from('chat_conversation_members')
    .select('user_id, last_read_at')
    .eq('conversation_id', cid)
  if (error) return { data: null, error: error.message }
  const peer = (data ?? []).find((r: { user_id?: string }) => r.user_id && r.user_id !== uid)
  const lastReadAt = parseUnknownTimestampToIso(peer?.last_read_at)
  return {
    data: { lastReadAt, peerReceiptsPrivate: false },
    error: null,
  }
}

/** Загрузка `last_read_at` и `profile_dm_receipts_private` собеседника через RPC (обход RLS на `users`). */
export async function fetchDirectPeerDmReceiptContext(
  conversationId: string,
): Promise<{ data: DirectPeerDmReceiptContext | null; error: string | null }> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { data: null, error: 'auth' }
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'conversation_required' }

  const { data: rawRpc, error } = await supabase.rpc('get_direct_peer_read_receipt_context', {
    p_conversation_id: cid,
  })
  const msg = error?.message ?? ''
  const rpcMissing =
    error &&
    (msg.includes('get_direct_peer_read_receipt_context') ||
      /schema cache|does not exist|PGRST202/i.test(msg) ||
      (error as { code?: string }).code === '42883')
  if (error && rpcMissing) {
    return fetchDirectPeerDmReceiptContextMembersOnly(cid, uid)
  }
  if (error) return { data: null, error: error.message }

  const data = unwrapRpcJsonData(rawRpc)
  if (!data || typeof data !== 'object') return { data: null, error: 'rpc_invalid' }
  const j = data as Record<string, unknown>
  if (j.ok !== true && j.ok !== 'true') {
    const err = typeof j.error === 'string' ? j.error : 'rpc_failed'
    return { data: null, error: err }
  }

  let lastReadAt = parseUnknownTimestampToIso(j.peer_last_read_at)
  const peerReceiptsPrivate = j.peer_dm_receipts_private === true

  if (!lastReadAt) {
    const fb = await fetchDirectPeerDmReceiptContextMembersOnly(cid, uid)
    if (fb.data?.lastReadAt) lastReadAt = fb.data.lastReadAt
  }

  return {
    data: { lastReadAt, peerReceiptsPrivate },
    error: null,
  }
}

/** Статусы исходящего в ЛС: контур / половина / полный круг (без галочек). */
export type DmOutgoingReceiptLevel = 'pending' | 'sent' | 'delivered' | 'read'

/**
 * Статус исходящего в ЛС для своих сообщений.
 * - `sent` — на сервере; собеседник ещё не открывал тред (нет last_read_at).
 * - `delivered` — у собеседника есть курсор прочтения, но это сообщение новее курсора.
 * - `read` — last_read_at собеседника покрывает сообщение.
 * Если у вас или у собеседника включена приватность квитанций — только нейтральный `sent` (контур).
 */
export function directOutgoingReceiptStatus(
  message: DirectMessage,
  opts: {
    isOwn: boolean
    isDirectThread: boolean
    peerLastReadAt: string | null
    viewerReceiptsPrivate: boolean
    peerReceiptsPrivate: boolean
  },
): DmOutgoingReceiptLevel | null {
  if (!opts.isDirectThread || !opts.isOwn) return null
  if (message.kind === 'reaction' || message.kind === 'system') return null
  if (message.id.startsWith('local-')) return 'pending'

  const hideDetail = opts.viewerReceiptsPrivate || opts.peerReceiptsPrivate
  if (hideDetail) return 'sent'

  if (!opts.peerLastReadAt) return 'sent'
  const readT = new Date(opts.peerLastReadAt).getTime()
  const msgT = new Date(message.createdAt).getTime()
  if (!Number.isFinite(readT) || !Number.isFinite(msgT)) return 'sent'
  if (readT >= msgT) return 'read'
  return 'delivered'
}

export function mapDirectMessageFromRow(row: Record<string, unknown>): DirectMessage {
  return {
    id: String(row.id),
    senderUserId: typeof row.sender_user_id === 'string' ? row.sender_user_id : null,
    senderNameSnapshot:
      typeof row.sender_name_snapshot === 'string' && row.sender_name_snapshot.trim()
        ? row.sender_name_snapshot.trim()
        : 'Вы',
    kind: mapMessageKind(row.kind),
    body: typeof row.body === 'string' ? row.body : '',
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    editedAt: typeof row.edited_at === 'string' ? row.edited_at : null,
    replyToMessageId:
      typeof row.reply_to_message_id === 'string' && row.reply_to_message_id.trim()
        ? row.reply_to_message_id.trim()
        : null,
    quoteToMessageId:
      typeof (row as Record<string, unknown>).quote_to_message_id === 'string' &&
      String((row as Record<string, unknown>).quote_to_message_id).trim()
        ? String((row as Record<string, unknown>).quote_to_message_id).trim()
        : null,
    replyPreview: mapReplyPreviewFromRow(row),
    meta: mapMetaFromRow(row.meta),
  }
}

function mapDirectConversationRow(row: Record<string, unknown>): DirectConversationSummary {
  const storedTitle = typeof row.title === 'string' ? row.title.trim() : ''
  const otherUserId = typeof row.other_user_id === 'string' ? row.other_user_id : null
  const otherDisplayName =
    typeof row.other_display_name === 'string' && row.other_display_name.trim()
      ? row.other_display_name.trim()
      : ''
  const otherAvatarFromRpc =
    typeof row.other_avatar_url === 'string' && row.other_avatar_url.trim()
      ? normalizeSupabaseStoragePublicUrl(row.other_avatar_url.trim())
      : null

  const displayTitle = otherUserId
    ? otherDisplayName || storedTitle || 'Личный чат'
    : storedTitle || 'Сохраненное'

  const messageCount =
    typeof row.message_count === 'number' ? row.message_count : Number(row.message_count ?? 0) || 0
  const rawPreview =
    typeof row.last_message_preview === 'string' ? row.last_message_preview.trim() : ''
  const lastMessagePreview =
    rawPreview || (messageCount > 0 ? 'Изображение' : null)

  return {
    id: String(row.id),
    title: displayTitle,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    lastMessagePreview,
    messageCount,
    unreadCount:
      typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0,
    otherUserId,
    avatarUrl: otherUserId ? otherAvatarFromRpc : null,
  }
}

async function attachConversationAvatars(
  items: DirectConversationSummary[],
): Promise<DirectConversationSummary[]> {
  const userIds = Array.from(
    new Set(
      items
        .map((item) => item.otherUserId?.trim() ?? '')
        .filter(Boolean),
    ),
  )

  if (userIds.length === 0) return items

  const { data, error } = await supabase
    .from('users')
    .select('id, avatar_url')
    .in('id', userIds)

  if (error) return items

  const avatarMap = new Map<string, string | null>()
  for (const row of data ?? []) {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id) continue
    avatarMap.set(
      id,
      typeof row.avatar_url === 'string' && row.avatar_url.trim()
        ? normalizeSupabaseStoragePublicUrl(row.avatar_url.trim())
        : null,
    )
  }

  return items.map((item) => ({
    ...item,
    avatarUrl: item.otherUserId
      ? item.avatarUrl ?? avatarMap.get(item.otherUserId) ?? null
      : null,
  }))
}

export async function ensureSelfDirectConversation(): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_self_direct_conversation')
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function listDirectConversationsForUser(
): Promise<{ data: DirectConversationSummary[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_direct_conversations')
  if (error) return { data: null, error: error.message }
  const mapped = (data ?? []).map((row: unknown) => mapDirectConversationRow(row as Record<string, unknown>))
  const withAvatars = await attachConversationAvatars(mapped)
  return {
    data: withAvatars,
    error: null,
  }
}

export async function getDirectConversationForUser(
  conversationId: string,
): Promise<{ data: DirectConversationSummary | null; error: string | null }> {
  const list = await listDirectConversationsForUser()
  if (list.error) return { data: null, error: list.error }
  const item = (list.data ?? []).find((row) => row.id === conversationId) ?? null
  return { data: item, error: null }
}

/** Собеседники по числу сообщений в личке (без «Сохранённого»: otherUserId = null). */
export async function listMessengerPeersByMessageCount(
  limit = 6,
): Promise<{
  data: {
    userId: string
    messageCount: number
    avatarUrl: string | null
    lastMessageAt: string | null
  }[] | null
  error: string | null
}> {
  const res = await listDirectConversationsForUser()
  if (res.error) return { data: null, error: res.error }
  const rows = (res.data ?? [])
    .filter((c) => Boolean(c.otherUserId?.trim()))
    .map((c) => ({
      userId: c.otherUserId!.trim(),
      messageCount: c.messageCount,
      avatarUrl: c.avatarUrl,
      lastMessageAt: c.lastMessageAt,
    }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, Math.max(0, limit))
  return { data: rows, error: null }
}

const DIRECT_MESSAGES_PAGE_MAX = 100

/** Для PostgREST or(): значение created_at в двойных кавычках. */
function escapePostgrestQuotedTimestamp(iso: string): string {
  return iso.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Страница личных сообщений: по умолчанию последние `limit` штук;
 * с `before` — ещё `limit` сообщений старше курсора (created_at, id).
 *
 * Реализовано через PostgREST (RLS на `chat_messages`), без RPC — чтобы работало,
 * даже если миграция `list_direct_messages_page` ещё не применена на проекте.
 */
export async function listDirectMessagesPage(
  conversationId: string,
  options?: { before?: { createdAt: string; id: string }; limit?: number },
): Promise<{ data: DirectMessage[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.min(
    Math.max(options?.limit ?? 50, 1),
    DIRECT_MESSAGES_PAGE_MAX,
  )
  const before = options?.before

  const convo = await getDirectConversationForUser(conversationId)
  if (convo.error) return { data: null, error: convo.error, hasMoreOlder: false }
  if (!convo.data) return { data: null, error: 'Чат не найден', hasMoreOlder: false }

  let query = supabase
    .from('chat_messages')
    .select(
      'id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at, edited_at, reply_to_message_id, quote_to_message_id, reply_preview',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)

  if (before) {
    const ts = escapePostgrestQuotedTimestamp(before.createdAt)
    const bid = before.id.trim()
    query = query.or(`and(created_at.eq."${ts}",id.lt.${bid}),created_at.lt."${ts}"`)
  }

  const { data, error } = await query

  if (error) return { data: null, error: error.message, hasMoreOlder: false }

  const rows = (data ?? []) as Record<string, unknown>[]
  const chronological = [...rows].reverse().map((row) => mapDirectMessageFromRow(row))
  const hasMoreOlder = rows.length === limit
  return { data: chronological, error: null, hasMoreOlder }
}

export async function ensureDirectConversationWithUser(
  targetUserId: string,
  targetTitle?: string | null,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_direct_conversation_with_user', {
    p_target_user_id: targetUserId,
    p_target_title: targetTitle ?? null,
  })
  if (error) {
    const msg = error.message
    if (msg.includes('dm_not_allowed')) {
      return {
        data: null,
        error: 'Этот пользователь принимает личные сообщения только от взаимных контактов.',
      }
    }
    return { data: null, error: msg }
  }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function markDirectConversationRead(
  conversationId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_direct_conversation_read', {
    p_conversation_id: conversationId,
  })
  if (!error) requestMessengerUnreadRefresh()
  return { error: error?.message ?? null }
}

export async function getDirectUnreadCount(): Promise<{ data: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_direct_conversations')
  if (error) return { data: null, error: error.message }
  const count = Array.isArray(data)
    ? data.reduce((sum: number, row: Record<string, unknown>) => sum + (typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0), 0)
    : 0
  return { data: count, error: null }
}

export type AppendDirectMessageResult = {
  messageId: string | null
  createdAt: string | null
}

function parseAppendDirectMessageRpcPayload(data: unknown): AppendDirectMessageResult {
  if (!data || typeof data !== 'object') return { messageId: null, createdAt: null }
  const r = data as Record<string, unknown>
  return {
    messageId: typeof r.message_id === 'string' && r.message_id ? r.message_id : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

export async function appendDirectMessage(
  conversationId: string,
  body: string,
  options?: {
    kind?: DirectMessageKind
    meta?: Record<string, unknown> | null
    replyToMessageId?: string | null
  },
): Promise<{ data: AppendDirectMessageResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('append_direct_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_kind: options?.kind ?? 'text',
    p_meta: options?.meta ?? null,
    p_reply_to_message_id: options?.replyToMessageId?.trim() || null,
  })

  if (error) return { data: null, error: error.message }
  return {
    data: parseAppendDirectMessageRpcPayload(data),
    error: null,
  }
}

export type ToggleDirectMessageReactionResult = {
  action: 'added' | 'removed'
  messageId: string
  createdAt: string | null
}

function parseToggleDirectMessageReactionPayload(data: unknown): ToggleDirectMessageReactionResult | null {
  if (!data || typeof data !== 'object') return null
  const r = data as Record<string, unknown>
  const action = r.action === 'removed' ? 'removed' : r.action === 'added' ? 'added' : null
  const messageId =
    typeof r.message_id === 'string' && r.message_id.trim() ? r.message_id.trim() : null
  if (!action || !messageId) return null
  return {
    action,
    messageId,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
  }
}

export function isDirectReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI_WHITELIST as readonly string[]).includes(value)
}

export async function toggleDirectMessageReaction(
  conversationId: string,
  targetMessageId: string,
  emoji: ReactionEmoji,
): Promise<{ data: ToggleDirectMessageReactionResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('toggle_direct_message_reaction', {
    p_conversation_id: conversationId,
    p_target_message_id: targetMessageId,
    p_emoji: emoji,
  })
  if (error) return { data: null, error: error.message }
  return { data: parseToggleDirectMessageReactionPayload(data), error: null }
}

export async function editDirectMessage(
  conversationId: string,
  messageId: string,
  newBody: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('edit_direct_message', {
    p_conversation_id: conversationId.trim(),
    p_message_id: messageId.trim(),
    p_new_body: newBody,
  })
  return { error: error?.message ?? null }
}

export async function deleteDirectMessage(
  conversationId: string,
  messageId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_direct_message', {
    p_conversation_id: conversationId.trim(),
    p_message_id: messageId.trim(),
  })
  return { error: error?.message ?? null }
}

/** Макс. размер исходного файла до пережатия в uploadMessengerImage. */
export const MESSENGER_PHOTO_INPUT_MAX_BYTES = 20 * 1024 * 1024

/** Макс. размер голосового после записи (совпадает с лимитом bucket после миграции). */
export const MESSENGER_AUDIO_MAX_BYTES = 10 * 1024 * 1024

function extensionForAudioBlob(blob: Blob): string {
  const t = (blob.type || '').toLowerCase()
  if (t.includes('webm')) return 'webm'
  if (t.includes('ogg')) return 'ogg'
  if (t.includes('mp4') || t.includes('m4a')) return 'm4a'
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3'
  if (t.includes('wav')) return 'wav'
  if (t.includes('aac')) return 'aac'
  return 'webm'
}

const MESSENGER_IMAGE_MAX_EDGE = 1680
const MESSENGER_IMAGE_JPEG_QUALITY = 0.86
/** Превью в ленте: меньший файл, отдельный объект в storage (качество/размер — только здесь). */
const MESSENGER_THUMB_MAX_EDGE = 420
const MESSENGER_THUMB_JPEG_QUALITY = 0.82

async function encodeJpegFromBitmap(bmp: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no_canvas')
  ctx.drawImage(bmp, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
  )
  if (!blob) throw new Error('to_blob_failed')
  return blob
}

async function messengerImageFullAndThumbBlobs(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const bmp = await createImageBitmap(file)
  try {
    const full = await encodeJpegFromBitmap(bmp, MESSENGER_IMAGE_MAX_EDGE, MESSENGER_IMAGE_JPEG_QUALITY)
    const thumb = await encodeJpegFromBitmap(bmp, MESSENGER_THUMB_MAX_EDGE, MESSENGER_THUMB_JPEG_QUALITY)
    return { full, thumb }
  } finally {
    bmp.close()
  }
}

/** Загрузка полного и превью JPEG в bucket `messenger-media` (первый сегмент пути = conversation_id). */
export async function uploadMessengerImage(
  conversationId: string,
  file: File,
): Promise<{ path: string | null; thumbPath: string | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { path: null, thumbPath: null, error: 'Нет чата' }
  if (!file.type.startsWith('image/')) return { path: null, thumbPath: null, error: 'Нужен файл изображения' }
  if (file.size > MESSENGER_PHOTO_INPUT_MAX_BYTES)
    return { path: null, thumbPath: null, error: 'Файл слишком большой (макс. 20 МБ)' }

  try {
    const { full, thumb } = await messengerImageFullAndThumbBlobs(file)
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const path = `${cid}/${id}.jpg`
    const thumbPath = `${cid}/${id}_thumb.jpg`
    const { error } = await supabase.storage.from('messenger-media').upload(path, full, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    if (error) return { path: null, thumbPath: null, error: error.message }
    const { error: thumbErr } = await supabase.storage.from('messenger-media').upload(thumbPath, thumb, {
      contentType: 'image/jpeg',
      upsert: false,
    })
    if (thumbErr) return { path, thumbPath: null, error: null }
    return { path, thumbPath, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'upload_failed'
    return { path: null, thumbPath: null, error: msg }
  }
}

/** Загрузка аудио в `messenger-media` (первый сегмент пути = conversation_id). */
export async function uploadMessengerAudio(
  conversationId: string,
  blob: Blob,
): Promise<{ path: string | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { path: null, error: 'Нет чата' }
  if (blob.size > MESSENGER_AUDIO_MAX_BYTES)
    return { path: null, error: 'Запись слишком длинная или файл слишком большой' }
  const ext = extensionForAudioBlob(blob)
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${cid}/${id}.${ext}`
  const ct =
    blob.type && blob.type.startsWith('audio/') ? blob.type : ext === 'webm' ? 'audio/webm' : `audio/${ext}`
  const { error } = await supabase.storage.from('messenger-media').upload(path, blob, {
    contentType: ct,
    upsert: false,
  })
  if (error) return { path: null, error: error.message }
  return { path, error: null }
}

/**
 * Путь превью `_thumb.jpg` для объекта из `uploadMessengerImage` (основной файл — `…/id.jpg`).
 * В meta поста хранится только основной path; превью — отдельный объект в bucket.
 */
export function messengerStoragePathToThumbPath(storagePath: string): string | null {
  const p = storagePath.trim()
  if (!p || p.includes('..')) return null
  if (/_thumb\.jpg$/i.test(p)) return null
  if (!/\.jpg$/i.test(p)) return null
  return p.replace(/\.jpg$/i, '_thumb.jpg')
}

/** Временная ссылка на вложение (bucket приватный; для <img src=…>). */
export async function getMessengerImageSignedUrl(
  storagePath: string,
  expiresSec = 3600,
): Promise<{ url: string | null; error: string | null }> {
  const path = storagePath.trim()
  if (!path) return { url: null, error: 'empty_path' }
  const { data, error } = await supabase.storage
    .from('messenger-media')
    .createSignedUrl(path, expiresSec)
  if (error) return { url: null, error: error.message }
  return { url: data?.signedUrl ?? null, error: null }
}
