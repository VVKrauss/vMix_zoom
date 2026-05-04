import { useCallback, useEffect, useState } from 'react'
import {
  disableMessengerPush,
  enableMessengerPush,
  isMessengerWebPushConfigured,
  isWebPushApiSupported,
  reconcileMessengerPushSubscription,
} from '../lib/messengerWebPush'
import { unlockAudioContext } from '../lib/messengerSound'

type PushUi = 'absent' | 'unconfigured' | 'off' | 'on' | 'denied'

/**
 * Состояние Web Push в мессенджере и переключатель подписки.
 */
export function useMessengerWebPushState(
  userId: string | undefined,
  setGlobalError: (msg: string | null) => void,
): {
  pushUi: PushUi
  pushBusy: boolean
  refreshPushUi: () => Promise<void>
  toggleMessengerPush: () => Promise<void>
} {
  const [pushUi, setPushUi] = useState<PushUi>('absent')
  const [pushBusy, setPushBusy] = useState(false)

  const refreshPushUi = useCallback(async () => {
    if (!userId || !isWebPushApiSupported()) {
      setPushUi('absent')
      return
    }
    if (!isMessengerWebPushConfigured()) {
      setPushUi('unconfigured')
      return
    }
    if (Notification.permission === 'denied') {
      setPushUi('denied')
      return
    }

    const reconciled = await reconcileMessengerPushSubscription(userId)
    if (!reconciled.ok && reconciled.error) {
      setGlobalError(reconciled.error)
    }
    if (reconciled.state === 'denied') {
      setPushUi('denied')
      return
    }

    setPushUi(reconciled.state === 'on' ? 'on' : 'off')
  }, [userId, setGlobalError])

  useEffect(() => {
    void refreshPushUi()
  }, [refreshPushUi])

  useEffect(() => {
    if (!userId || !isWebPushApiSupported() || !isMessengerWebPushConfigured()) return
    const t = window.setInterval(() => {
      void refreshPushUi()
    }, 45_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void refreshPushUi()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [userId, refreshPushUi])

  const toggleMessengerPush = useCallback(async () => {
    if (!userId || pushUi === 'absent' || pushUi === 'unconfigured' || pushBusy) return
    unlockAudioContext()
    if (pushUi === 'denied') return
    if (pushUi === 'on') {
      setPushBusy(true)
      try {
        const res = await disableMessengerPush(userId)
        if (!res.ok) {
          setGlobalError(res.error ?? 'Не удалось отключить push')
          await refreshPushUi()
          return
        }
        setPushUi('off')
      } finally {
        setPushBusy(false)
      }
      return
    }
    setPushBusy(true)
    try {
      const res = await enableMessengerPush(userId)
      if (!res.ok) {
        if (res.error === 'permission_denied') setPushUi('denied')
        else setGlobalError(res.error ?? 'Не удалось включить push')
        await refreshPushUi()
        return
      }
      setPushUi('on')
    } finally {
      setPushBusy(false)
    }
  }, [userId, pushUi, pushBusy, refreshPushUi, setGlobalError])

  return { pushUi, pushBusy, refreshPushUi, toggleMessengerPush }
}
