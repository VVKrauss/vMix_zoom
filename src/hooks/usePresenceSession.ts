import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { v1PresenceForegroundPulse, v1PresenceMarkBackground } from '../api/presenceApi'

/**
 * Присутствие на сайте: пока вкладка на переднем плане — периодический пульс;
 * при уходе в фон — отдельная отметка на сервере (момент «перестал быть на переднем плане»).
 */
export function usePresenceSession() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.id) return

    const PULSE_MS = 10_000

    const callPulse = async () => {
      await v1PresenceForegroundPulse()
    }

    const pulseForeground = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
      void callPulse()
    }

    const markBackground = () => {
      void v1PresenceMarkBackground()
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
