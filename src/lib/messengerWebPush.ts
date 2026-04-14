import { supabase } from './supabase'

const VAPID = () => import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? ''

export function isMessengerWebPushConfigured(): boolean {
  return !!VAPID()
}

/**
 * На iOS Safari `PushManager` часто не висит на `window`, хотя `registration.pushManager` есть —
 * поэтому проверяем прототип `ServiceWorkerRegistration`.
 */
export function isWebPushApiSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return false
  try {
    return (
      typeof ServiceWorkerRegistration !== 'undefined' &&
      'pushManager' in ServiceWorkerRegistration.prototype
    )
  } catch {
    return false
  }
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export async function isMessengerPushSubscribed(): Promise<boolean> {
  if (!isWebPushApiSupported() || !isMessengerWebPushConfigured()) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  } catch {
    return false
  }
}

export async function enableMessengerPush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isWebPushApiSupported() || !isMessengerWebPushConfigured()) {
    return { ok: false, error: 'push_not_configured' }
  }

  const key = VAPID()
  let perm = Notification.permission
  if (perm === 'default') {
    perm = await Notification.requestPermission()
  }
  if (perm !== 'granted') {
    return { ok: false, error: perm === 'denied' ? 'permission_denied' : 'permission_blocked' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      const keyBytes = urlBase64ToUint8Array(key)
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes as BufferSource,
      })
    }

    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        subscription: json,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    )

    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'subscribe_failed'
    return { ok: false, error: msg }
  }
}

export async function disableMessengerPush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isWebPushApiSupported()) return { ok: true }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()

    if (sub) {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', sub.endpoint)

      if (error) return { ok: false, error: error.message }

      await sub.unsubscribe()
    }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unsubscribe_failed'
    return { ok: false, error: msg }
  }
}

/**
 * Сверяет браузерную подписку с записью в БД.
 * Если подписка в браузере есть, а записи в БД нет — восстанавливает её.
 * Если подписки в браузере нет — ничего не включает автоматически.
 */
export async function reconcileMessengerPushSubscription(
  userId: string,
): Promise<{ ok: boolean; state: 'absent' | 'off' | 'on' | 'denied'; error?: string }> {
  if (!userId || !isWebPushApiSupported()) {
    return { ok: true, state: 'absent' }
  }

  if (!isMessengerWebPushConfigured()) {
    return { ok: false, state: 'off', error: 'push_not_configured' }
  }

  if (Notification.permission === 'denied') {
    return { ok: true, state: 'denied' }
  }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()

    if (!sub) {
      return { ok: true, state: 'off' }
    }

    const endpoint = sub.endpoint?.trim()
    if (!endpoint) {
      return { ok: false, state: 'off', error: 'subscription_missing_endpoint' }
    }

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .maybeSingle()

    if (error) {
      return { ok: false, state: 'off', error: error.message }
    }

    if (!data) {
      const json = sub.toJSON()
      const { error: upsertError } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint,
          subscription: json,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' },
      )

      if (upsertError) {
        return { ok: false, state: 'off', error: upsertError.message }
      }
    }

    return { ok: true, state: 'on' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'reconcile_failed'
    return { ok: false, state: 'off', error: msg }
  }
}

/**
 * Жёсткий reset:
 * - удаляет текущую subscription
 * - удаляет её из БД
 * - unregister service workers
 * - перерегистрирует SW
 * - создаёт новую subscription
 */
export async function hardResetMessengerPush(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!userId || !isWebPushApiSupported() || !isMessengerWebPushConfigured()) {
    return { ok: false, error: 'push_not_configured' }
  }

  try {
    const regs = await navigator.serviceWorker.getRegistrations()

    for (const reg of regs) {
      try {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('endpoint', sub.endpoint)

          await sub.unsubscribe()
        }
      } catch {
        // ignore
      }
    }

    for (const reg of regs) {
      try {
        await reg.unregister()
      } catch {
        // ignore
      }
    }

    // даём браузеру шанс завершить unregister
    await new Promise((resolve) => setTimeout(resolve, 300))

    // путь тот же, что регистрирует vite-plugin-pwa
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    const key = VAPID()
    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission()
    }
    if (perm !== 'granted') {
      return { ok: false, error: perm === 'denied' ? 'permission_denied' : 'permission_blocked' }
    }

    const keyBytes = urlBase64ToUint8Array(key)
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes as BufferSource,
    })

    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        subscription: json,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    )

    if (error) return { ok: false, error: error.message }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'hard_reset_failed'
    return { ok: false, error: msg }
  }
}
