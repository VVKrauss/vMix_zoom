import { previewTextForDirectMessageTail } from './messenger'
import { subscribeUserFeed } from '../api/messengerRealtime'

type Notify = () => void

let channel: any | null = null
let boundUserId: string | null = null
let refCount = 0
const notifies = new Set<Notify>()

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

function emitBgMessage(d: MessengerBgMessageDetail): void {
  const preview = previewTextForDirectMessageTail({
    kind: d.kind as any,
    body: d.body,
    meta: null,
  })
  const detail: MessengerBgMessageDetail = {
    conversationId: d.conversationId,
    senderUserId: d.senderUserId,
    kind: d.kind,
    body: preview,
    createdAt: d.createdAt,
    replyToMessageId: d.replyToMessageId ?? null,
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

  if (!channel || boundUserId !== userId) {
    if (channel) {
      try {
        channel()
      } catch {
        /* noop */
      }
      channel = null
    }
    boundUserId = userId
    channel = subscribeUserFeed(userId, (e) => {
      if (e.type === 'bg_message') {
        emit()
        emitBgMessage({
          conversationId: e.conversationId,
          senderUserId: e.senderUserId,
          kind: e.kind,
          body: e.body,
          createdAt: e.createdAt,
          replyToMessageId: e.replyToMessageId ?? null,
        })
        return
      }
      if (e.type === 'unread_invalidate') {
        emit()
        return
      }
      if (e.type === 'membership_changed') {
        emit()
      }
    })
  }

  return () => {
    notifies.delete(onSignal)
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0 && channel) {
      try {
        channel()
      } catch {
        /* noop */
      }
      channel = null
      boundUserId = null
    }
  }
}
