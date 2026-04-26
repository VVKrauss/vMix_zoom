import { v1DeletePushSubscription, v1PushSubscriptionExists, v1UpsertPushSubscription } from '../api/pushSubscriptionsApi'

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

async function subscribePushOrThrow(reg: ServiceWorkerRegistration, keyBytes: BufferSource): Promise<PushSubscription> {
  try {
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const retriable =
      /registration failed/i.test(msg) ||
      /push service error/i.test(msg) ||
      /invalid.*applicationServerKey/i.test(msg)
    if (!retriable) throw e
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      try {
        await existing.unsubscribe()
      } catch {
        /* noop */
      }
    }
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    })
  }
}

export async function enableMessengerPush(_userId: string): Promise<{ ok: boolean; error?: string }> {
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
      sub = await subscribePushOrThrow(reg, keyBytes as BufferSource)
    }

    const json = sub.toJSON()
    const { error } = await v1UpsertPushSubscription({
      endpoint: sub.endpoint,
      subscription: json,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
    if (error) return { ok: false, error }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'subscribe_failed'
    return { ok: false, error: msg }
  }
}

export async function disableMessengerPush(_userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isWebPushApiSupported()) return { ok: true }

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()

    if (sub) {
      const { error } = await v1DeletePushSubscription(sub.endpoint)
      if (error) return { ok: false, error }

      await sub.unsubscribe()
    }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unsubscribe_failed'
    return { ok: false, error: msg }
  }
}

/**
 * Если в браузере уже есть push-подписка, а строки в БД нет — восстанавливает upsert.
 * Не включает push сама по себе (нет подписки в браузере → state off).
 */
export async function reconcileMessengerPushSubscription(
  _userId: string,
): Promise<{ ok: boolean; state: 'absent' | 'off' | 'on' | 'denied'; error?: string }> {
  if (!_userId || !isWebPushApiSupported()) {
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

    const exists = await v1PushSubscriptionExists(endpoint)
    if (exists.error) return { ok: false, state: 'off', error: exists.error }
    if (!exists.data) {
      const json = sub.toJSON()
      const { error: upsertError } = await v1UpsertPushSubscription({
        endpoint,
        subscription: json,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
      if (upsertError) return { ok: false, state: 'off', error: upsertError }
    }

    return { ok: true, state: 'on' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'reconcile_failed'
    return { ok: false, state: 'off', error: msg }
  }
}
