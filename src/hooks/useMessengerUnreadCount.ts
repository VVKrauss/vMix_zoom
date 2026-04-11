import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDirectUnreadCount } from '../lib/messenger'

export function useMessengerUnreadCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    let timer: number | null = null

    const refresh = async () => {
      if (!user?.id) {
        if (active) setCount(0)
        return
      }
      const res = await getDirectUnreadCount()
      if (!active) return
      if (!res.error) setCount(res.data ?? 0)
    }

    void refresh()
    timer = window.setInterval(() => {
      void refresh()
    }, 30000)

    const onFocus = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      active = false
      if (timer != null) window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [user?.id])

  return count
}
