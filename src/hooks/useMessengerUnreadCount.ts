import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDirectUnreadCount, MESSENGER_UNREAD_REFRESH_EVENT } from '../lib/messenger'
import { supabase } from '../lib/supabase'

const REFRESH_DEBOUNCE_MS = 380
const FALLBACK_POLL_MS = 60000

/**
 * Счётчик непрочитанных в личных чатах.
 * Обновляется по Realtime (новые сообщения / сброс прочитанного), после markDirectConversationRead
 * (событие MESSENGER_UNREAD_REFRESH_EVENT) и при фокусе окна.
 */
export function useMessengerUnreadCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const debounceTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  useEffect(() => {
    let active = true
    let pollTimer: number | null = null

    const refresh = async () => {
      if (!user?.id) {
        if (active) setCount(0)
        return
      }
      const res = await getDirectUnreadCount()
      if (!active) return
      if (!res.error) setCount(res.data ?? 0)
    }

    const scheduleRefresh = () => {
      if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null
        void refresh()
      }, REFRESH_DEBOUNCE_MS)
    }

    void refresh()

    pollTimer = window.setInterval(() => {
      void refresh()
    }, FALLBACK_POLL_MS)

    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)

    const onImmediateRefresh = () => {
      void refresh()
    }
    window.addEventListener(MESSENGER_UNREAD_REFRESH_EVENT, onImmediateRefresh)

    const uid = user?.id
    let channel: ReturnType<typeof supabase.channel> | null = null

    if (uid) {
      channel = supabase
        .channel(`messenger-unread:${uid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          () => {
            scheduleRefresh()
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chat_conversation_members',
            filter: `user_id=eq.${uid}`,
          },
          () => {
            scheduleRefresh()
          },
        )
        .subscribe()
    }

    return () => {
      active = false
      if (debounceTimerRef.current != null) window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
      if (pollTimer != null) window.clearInterval(pollTimer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(MESSENGER_UNREAD_REFRESH_EVENT, onImmediateRefresh)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [user?.id])

  return count
}
