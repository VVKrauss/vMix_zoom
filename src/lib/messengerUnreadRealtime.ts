import type { RealtimeChannel } from '@supabase/supabase-js'
import { mapDirectMessageFromRow, previewTextForDirectMessageTail } from './messenger'
import { supabase } from './supabase'

type Notify = () => void

let channel: RealtimeChannel | null = null
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
}

function emitBgMessage(row: Record<string, unknown>): void {
  const conversationId = typeof row.conversation_id === 'string' ? row.conversation_id : null
  if (!conversationId) return
  const msg = mapDirectMessageFromRow(row)
  const preview = previewTextForDirectMessageTail(msg)

  const detail: MessengerBgMessageDetail = {
    conversationId,
    senderUserId: typeof row.sender_user_id === 'string' ? row.sender_user_id : null,
    kind: msg.kind,
    body: preview,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
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
      void supabase.removeChannel(channel)
      channel = null
    }
    boundUserId = userId
    channel = supabase
      .channel(`messenger-unread:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          emit()
          emitBgMessage(payload.new as Record<string, unknown>)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversation_members',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          emit()
        },
      )
      .subscribe()
  }

  return () => {
    notifies.delete(onSignal)
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0 && channel) {
      void supabase.removeChannel(channel)
      channel = null
      boundUserId = null
    }
  }
}
