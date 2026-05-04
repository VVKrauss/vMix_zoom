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

async function readMessengerWebPushDesired(
  userId: string,
): Promise<{ enabled: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('users')
    .select('messenger_web_push_enabled')
    .eq('id', userId)
    .maybeSingle()
  if (error) return { enabled: false, error: error.message }
  const raw = (data as { messenger_web_push_enabled?: boolean } | null)?.messenger_web_push_enabled
  return { enabled: raw === true }
}

async function setMessengerWebPushDesired(userId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('users')
    .update({ messenger_web_push_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Снять локальную подписку (ошибки глотаем — цель «чистый» браузер). */
async function unsubscribeCurrentPushSilently(reg: ServiceWorkerRegistration): Promise<void> {
  try {
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
  } catch {
    /* noop */
  }
}

/**
 * Синхронизация: флаг в `users.messenger_web_push_enabled` + `push_subscriptions` + PushManager.
 * При выключенном намерении снимаем подписку в браузере и удаляем все строки push для пользователя.
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
    const desiredRes = await readMessengerWebPushDesired(userId)
    if (desiredRes.error) {
      return { ok: false, state: 'off', error: desiredRes.error }
    }
    const desired = desiredRes.enabled
    const reg = await navigator.serviceWorker.ready

    if (!desired) {
      await unsubscribeCurrentPushSilently(reg)
      const { error: delErr } = await supabase.from('push_subscriptions').delete().eq('user_id', userId)
      if (delErr) return { ok: false, state: 'off', error: delErr.message }
      return { ok: true, state: 'off' }
    }

    if (Notification.permission !== 'granted') {
      return { ok: true, state: 'off' }
    }

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
    await unsubscribeCurrentPushSilently(reg)

    const keyBytes = urlBase64ToUint8Array(key)
    const sub = await subscribePushOrThrow(reg, keyBytes as BufferSource)

    const json = sub.toJSON()
    const { error: upErr } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        subscription: json,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,endpoint' },
    )

    if (upErr) {
      try {
        await sub.unsubscribe()
      } catch {
        /* noop */
      }
      return { ok: false, error: upErr.message }
    }

    const pref = await setMessengerWebPushDesired(userId, true)
    if (!pref.ok) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint)
      try {
        await sub.unsubscribe()
      } catch {
        /* noop */
      }
      return { ok: false, error: pref.error ?? 'preference_update_failed' }
    }

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'subscribe_failed'
    return { ok: false, error: msg }
  }
}

export async function disableMessengerPush(userId: string): Promise<{ ok: boolean; error?: string }> {
  const pref = await setMessengerWebPushDesired(userId, false)
  if (!pref.ok) return { ok: false, error: pref.error }

  const { error: delErr } = await supabase.from('push_subscriptions').delete().eq('user_id', userId)
  if (delErr) return { ok: false, error: delErr.message }

  if (!isWebPushApiSupported()) return { ok: true }

  try {
    const reg = await navigator.serviceWorker.ready
    await unsubscribeCurrentPushSilently(reg)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unsubscribe_failed'
    return { ok: false, error: msg }
  }
}

/**
 * Для UI: «полностью включено» — намерение в БД, разрешение, есть подписка в браузере и строка в БД для endpoint.
 */
export async function isMessengerPushFullyOn(userId: string): Promise<boolean> {
  if (!userId || !isWebPushApiSupported() || !isMessengerWebPushConfigured()) return false
  if (Notification.permission !== 'granted') return false

  const desired = await readMessengerWebPushDesired(userId)
  if (!desired) return false

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return false
    const endpoint = sub.endpoint?.trim()
    if (!endpoint) return false

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .maybeSingle()

    return !error && !!data
  } catch {
    return false
  }
}
