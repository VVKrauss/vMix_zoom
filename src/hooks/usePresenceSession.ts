import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

/**
 * Присутствие на сайте: пока вкладка на переднем плане — периодический пульс;
 * при уходе в фон — отдельная отметка на сервере (момент «перестал быть на переднем плане»).
 */
export function usePresenceSession() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return

    const pulseForeground = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      void supabase.rpc('presence_foreground_pulse')
    }

    const markBackground = () => {
      void supabase.rpc('presence_mark_background')
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') pulseForeground()
      else markBackground()
    }

    pulseForeground()
    const intervalId = window.setInterval(pulseForeground, 45_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', markBackground)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', markBackground)
    }
  }, [user?.id])
}
