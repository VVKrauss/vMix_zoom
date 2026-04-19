import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

/** Периодический heartbeat: обновляет `users.last_active_at` (сервер троттлит). */
export function usePresenceHeartbeat() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return

    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void supabase.rpc('touch_my_presence')
    }

    tick()
    const id = window.setInterval(tick, 55_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', tick)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [user?.id])
}
