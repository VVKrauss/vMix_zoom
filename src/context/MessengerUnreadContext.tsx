import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { getDirectUnreadCount, MESSENGER_UNREAD_REFRESH_EVENT } from '../lib/messenger'
import { subscribeMessengerUnreadRealtime } from '../lib/messengerUnreadRealtime'

const REFRESH_DEBOUNCE_MS = 380
const FALLBACK_POLL_MS = 60_000
const BASE_TITLE = 'redflow.online'

interface MessengerUnreadContextValue {
  count: number
}

const MessengerUnreadContext = createContext<MessengerUnreadContextValue>({ count: 0 })

/**
 * Единый провайдер счётчика непрочитанных.
 * Монтируется один раз в дереве (main.tsx); все потребители читают через useMessengerUnread().
 * Управляет Realtime-подпиской, дебаунсом, поллингом и document.title.
 */
export function MessengerUnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(true)
  const disableWs = String(import.meta.env.VITE_MESSENGER_DISABLE_WS ?? '').trim() === '1'

  const refresh = useCallback(async () => {
    if (!activeRef.current) return
    if (!user?.id) {
      if (activeRef.current) setCount(0)
      return
    }
    const res = await getDirectUnreadCount()
    if (activeRef.current && !res.error) setCount(res.data ?? 0)
  }, [user?.id])

  // Заголовок вкладки
  useEffect(() => {
    document.title =
      count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE}` : BASE_TITLE
  }, [count])

  useEffect(() => {
    activeRef.current = true

    const scheduleRefresh = () => {
      if (debounceRef.current != null) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void refresh()
      }, REFRESH_DEBOUNCE_MS)
    }

    void refresh()

    const pollId = setInterval(() => void refresh(), FALLBACK_POLL_MS)
    const onFocus = () => void refresh()
    const onImmediate = () => void refresh()

    window.addEventListener('focus', onFocus)
    window.addEventListener(MESSENGER_UNREAD_REFRESH_EVENT, onImmediate)

    const uid = user?.id
    const unsub = !disableWs && uid ? subscribeMessengerUnreadRealtime(uid, scheduleRefresh) : null

    return () => {
      activeRef.current = false
      if (debounceRef.current != null) clearTimeout(debounceRef.current)
      clearInterval(pollId)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener(MESSENGER_UNREAD_REFRESH_EVENT, onImmediate)
      unsub?.()
    }
  }, [user?.id, refresh, disableWs])

  return (
    <MessengerUnreadContext.Provider value={{ count }}>
      {children}
    </MessengerUnreadContext.Provider>
  )
}

/** Читает счётчик непрочитанных из контекста. Нужен MessengerUnreadProvider выше по дереву. */
export function useMessengerUnread(): number {
  return useContext(MessengerUnreadContext).count
}
