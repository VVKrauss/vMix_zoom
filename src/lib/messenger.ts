import type { ReactionEmoji } from '../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../types/roomComms'
import { isPostDraftV1 } from './postEditor/draftUtils'
import type { PostDraftV1 } from './postEditor/types'
import { supabase } from './supabase'

/** Событие для мгновенного пересчёта бейджа непрочитанных (см. useMessengerUnreadCount). */
export const MESSENGER_UNREAD_REFRESH_EVENT = 'vmix:messenger-unread-refresh'

export function requestMessengerUnreadRefresh(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MESSENGER_UNREAD_REFRESH_EVENT))
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

export type DirectMessageKind = 'text' | 'system' | 'reaction' | 'image'

export type DirectMessage = {
  id: string
  senderUserId: string | null
  senderNameSnapshot: string
  kind: DirectMessageKind
  body: string
  createdAt: string
  editedAt?: string | null
  replyToMessageId?: string | null
  /**
   * Meta из базы (jsonb):
   * - reaction: react_to
   * - image: image.path/thumbPath
   * - rich: link preview (link.*)
   */
  meta?: {
    react_to?: string
    image?: { path: string; thumbPath?: string }
    link?: { url: string; title?: string; description?: string; image?: string; siteName?: string }
    /** Редактор поста канала v1 */
    postDraft?: PostDraftV1
    /** Личка: soft-delete заменил сообщение системной заглушкой */
    deleted?: boolean
  } | null
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

  const deleted = o.deleted === true

  if (!react && !image && !linkMeta && !postDraft && !deleted) return null
  return {
    ...(deleted ? { deleted: true } : {}),
    ...(react ? { react_to: react } : {}),
    ...(image ? { image } : {}),
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
  if (raw === 'reaction' || raw === 'system' || raw === 'image') return raw
  return 'text'
}

/**
 * Строка превью хвоста диалога в списке для сообщения (в т.ч. фото без подписи — имя файла или метка).
 */
export function previewTextForDirectMessageTail(msg: Pick<DirectMessage, 'kind' | 'body' | 'meta'>): string {
  if (msg.kind !== 'image') return msg.body
  const cap = msg.body.replace(/\s+/g, ' ').trim()
  if (cap) return cap
  const path = msg.meta?.image?.path?.trim()
  if (path) {
    const base = path.split(/[/\\]/).pop()?.trim()
    if (base) return base
  }
  return 'Изображение'
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
      ? row.other_avatar_url.trim()
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
    avatarMap.set(id, typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null)
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
    .select('id, sender_user_id, sender_name_snapshot, kind, body, meta, created_at, edited_at, reply_to_message_id')
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

const MESSENGER_IMAGE_MAX_EDGE = 1680
const MESSENGER_IMAGE_JPEG_QUALITY = 0.86
/** Превью в ленте: меньший файл, отдельный объект в storage. */
const MESSENGER_THUMB_MAX_EDGE = 480
const MESSENGER_THUMB_JPEG_QUALITY = 0.76

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
  if (file.size > 20 * 1024 * 1024)
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
