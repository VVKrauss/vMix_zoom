import webpush from 'web-push'
import type { Pool } from 'pg'
import { readEnv } from '../env.js'

type PushSubscriptionRow = {
  endpoint: string
  subscription: any
}

let configured: boolean | null = null
let configuredDetails: { subject: string; publicKey: string } | null = null
let warnedUnconfiguredAtMs = 0

function isConfigured(): boolean {
  if (configured != null) return configured
  const env = readEnv()
  configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
  if (configured) {
    const subject = env.VAPID_SUBJECT || env.PUBLIC_ORIGIN
    configuredDetails = { subject, publicKey: env.VAPID_PUBLIC_KEY! }
    webpush.setVapidDetails(subject, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
  }
  return configured
}

export function getWebPushConfigStatus(): { configured: boolean; subject?: string; publicKey?: string } {
  const ok = isConfigured()
  if (!ok) return { configured: false }
  return { configured: true, subject: configuredDetails?.subject, publicKey: configuredDetails?.publicKey }
}

export async function sendWebPushToUser(
  pool: Pool,
  userId: string,
  payload: any,
  logger?: { warn: (o: any, msg?: string) => void; info?: (o: any, msg?: string) => void },
): Promise<void> {
  if (!isConfigured()) {
    const now = Date.now()
    // Avoid log spam on every message insert.
    if (logger && now - warnedUnconfiguredAtMs > 60_000) {
      warnedUnconfiguredAtMs = now
      logger.warn({ vapid: { configured: false } }, 'web_push_not_configured')
    }
    return
  }
  const uid = userId.trim()
  if (!uid) return
  const r = await pool.query<PushSubscriptionRow>(
    `select endpoint, subscription from public.push_subscriptions where user_id = $1`,
    [uid],
  )
  if (!r.rowCount) return

  const body = JSON.stringify(payload ?? {})

  for (const row of r.rows) {
    const endpoint = String((row as any).endpoint ?? '').trim()
    if (!endpoint) continue
    const sub = (row as any).subscription
    if (!sub) continue
    try {
      await webpush.sendNotification(sub, body)
    } catch (e: any) {
      const status = typeof e?.statusCode === 'number' ? e.statusCode : null
      // Subscription expired or gone → clean it.
      if (status === 404 || status === 410) {
        await pool.query(`delete from public.push_subscriptions where user_id=$1 and endpoint=$2`, [uid, endpoint])
        logger?.info?.({ uid, status }, 'web_push_subscription_pruned')
      } else {
        // Keep subscription; most likely VAPID mismatch, invalid payload, or transient push service error.
        logger?.warn?.({ uid, status, endpoint, err: { name: e?.name, message: e?.message } }, 'web_push_send_failed')
      }
    }
  }
}

