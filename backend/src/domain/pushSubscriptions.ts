import type { Pool } from 'pg'

export async function pushSubscriptionExists(pool: Pool, args: { userId: string; endpoint: string }): Promise<boolean> {
  const r = await pool.query(
    `select 1 from public.push_subscriptions where user_id = $1 and endpoint = $2 limit 1`,
    [args.userId, args.endpoint],
  )
  return !!r.rowCount
}

export async function upsertPushSubscription(pool: Pool, args: { userId: string; endpoint: string; subscription: unknown; userAgent: string | null }): Promise<void> {
  await pool.query(
    `
    insert into public.push_subscriptions (user_id, endpoint, subscription, user_agent, updated_at)
    values ($1, $2, $3::jsonb, $4, now())
    on conflict (user_id, endpoint)
    do update set subscription = excluded.subscription, user_agent = excluded.user_agent, updated_at = now()
    `,
    [args.userId, args.endpoint, JSON.stringify(args.subscription ?? null), args.userAgent],
  )
}

export async function deletePushSubscription(pool: Pool, args: { userId: string; endpoint: string }): Promise<void> {
  await pool.query(`delete from public.push_subscriptions where user_id = $1 and endpoint = $2`, [args.userId, args.endpoint])
}

