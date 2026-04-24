import { mapDirectMessageFromRow, previewTextForDirectMessageTail } from './messenger'
import { getBackendSocket, refreshBackendSocketAuth } from './backend/socket'

type Notify = () => void

let boundUserId: string | null = null
let refCount = 0
const notifies = new Set<Notify>()
let socketBound = false

function emit(): void {
  for (const fn of notifies) fn()
}

/**
 * Событие нового фонового сообщения (в диалоге, который сейчас не открыт).
 * detail: { conversationId: string; senderUserId: string | null; kind: string; body: string; createdAt: string }
 */
export const MESSENGER_BG_MESSAGE_EVENT = 'vmix:messenger-bg-message'

export interface MessengerBgMessageDetail {
  conversationId: string
  senderUserId: string | null
  kind: string
  body: string
  createdAt: string
  /** Для канала: комментарий к посту — превью в списке не меняем на текст комментария. */
  replyToMessageId?: string | null
}

function emitBgMessage(row: Record<string, unknown>): void {
  const conversationId = typeof row.conversation_id === 'string' ? row.conversation_id : null
  if (!conversationId) return
  const msg = mapDirectMessageFromRow(row)
  const preview = previewTextForDirectMessageTail(msg)
  const replyToMessageId = msg.replyToMessageId?.trim() ? msg.replyToMessageId.trim() : null

  const detail: MessengerBgMessageDetail = {
    conversationId,
    senderUserId: typeof row.sender_user_id === 'string' ? row.sender_user_id : null,
    kind: msg.kind,
    body: preview,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    replyToMessageId,
  }
  window.dispatchEvent(new CustomEvent(MESSENGER_BG_MESSAGE_EVENT, { detail }))
}

/**
 * Один Realtime-канал на пользователя для бейджа непрочитанных, даже если
 * `useMessengerUnreadCount` смонтирован в нескольких местах (шелл, комната, главная).
 * Также диспатчит MESSENGER_BG_MESSAGE_EVENT при каждом INSERT — потребители
 * фильтруют по conversation_id сами (пропуская активный тред).
 */
export function subscribeMessengerUnreadRealtime(userId: string, onSignal: () => void): () => void {
  notifies.add(onSignal)
  refCount += 1

  if (boundUserId !== userId) boundUserId = userId

  if (!socketBound) {
    socketBound = true
    refreshBackendSocketAuth()
    const socket = getBackendSocket()
    socket.on('dm:message:new', (payload) => {
      emit()
      const msg = payload?.message as Record<string, unknown>
      if (msg) {
        emitBgMessage({
          conversation_id: payload.conversationId,
          sender_user_id: msg.senderUserId,
          kind: msg.kind,
          body: msg.body,
          meta: msg.meta,
          created_at: msg.createdAt,
          reply_to_message_id: msg.replyToMessageId,
        })
      }
    })
    socket.on('unread:changed', () => emit())
  }

  return () => {
    notifies.delete(onSignal)
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0) {
      boundUserId = null
      // socket остается жить как синглтон; отписки не делаем, чтобы не драться между точками монтирования
    }
  }
}
