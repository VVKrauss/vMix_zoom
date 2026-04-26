import webpush from 'web-push'
import type { Pool } from 'pg'
import { readEnv } from '../env.js'

type PushSubscriptionRow = {
  endpoint: string
  subscription: any
}

let configured: boolean | null = null

function isConfigured(): boolean {
  if (configured != null) return configured
  const env = readEnv()
  configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
  if (configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT || env.PUBLIC_ORIGIN, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
  }
  return configured
}

export async function sendWebPushToUser(pool: Pool, userId: string, payload: any): Promise<void> {
  if (!isConfigured()) return
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
      }
    }
  }
}

