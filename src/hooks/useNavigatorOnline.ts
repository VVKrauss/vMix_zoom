import { useEffect, useState } from 'react'

export type MessengerNetBannerState = 'hidden' | 'offline' | 'onlineFlash'

/**
 * navigator.onLine + полоска под шапкой: красная офлайн, зелёная ~3 с после восстановления.
 */
export function useNavigatorOnline(): { isOnline: boolean; netBanner: MessengerNetBannerState } {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  )
  const [netBanner, setNetBanner] = useState<MessengerNetBannerState>('hidden')

  useEffect(() => {
    let hideTimer: number | undefined

    const sync = () => {
      const on = navigator.onLine
      setIsOnline(on)
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer)
        hideTimer = undefined
      }
      if (!on) {
        setNetBanner('offline')
        return
      }
      setNetBanner('onlineFlash')
      hideTimer = window.setTimeout(() => {
        setNetBanner('hidden')
        hideTimer = undefined
      }, 3000)
    }

    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    setIsOnline(navigator.onLine)
    setNetBanner(navigator.onLine ? 'hidden' : 'offline')

    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
      if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    }
  }, [])

  return { isOnline, netBanner }
}
