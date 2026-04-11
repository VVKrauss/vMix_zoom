import type { RealtimeChannel } from '@supabase/supabase-js'
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
 * Один Realtime-канал на пользователя для бейджа непрочитанных, даже если
 * `useMessengerUnreadCount` смонтирован в нескольких местах (шелл, комната, главная).
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
        () => {
          emit()
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
