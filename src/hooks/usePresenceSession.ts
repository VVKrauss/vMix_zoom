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

    let pulseRpc: 'presence_foreground_pulse' | 'touch_my_presence' = 'presence_foreground_pulse'
    const PULSE_MS = 10_000

    const callPulse = async () => {
      const { error } = await supabase.rpc(pulseRpc)
      if (!error) return

      const msg = String(error.message ?? '')
      const missingFn =
        error.code === '42883' ||
        msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        msg.includes('function') ||
        msg.includes('not found')

      if (pulseRpc === 'presence_foreground_pulse' && missingFn) {
        pulseRpc = 'touch_my_presence'
        await supabase.rpc(pulseRpc)
      }
    }

    const pulseForeground = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      void callPulse()
    }

    const markBackground = () => {
      void supabase.rpc('presence_mark_background')
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') pulseForeground()
      else markBackground()
    }

    pulseForeground()
    const intervalId = window.setInterval(pulseForeground, PULSE_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', markBackground)
    window.addEventListener('freeze', markBackground as any)
    window.addEventListener('beforeunload', markBackground)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', markBackground)
      window.removeEventListener('freeze', markBackground as any)
      window.removeEventListener('beforeunload', markBackground)
    }
  }, [user?.id])
}
