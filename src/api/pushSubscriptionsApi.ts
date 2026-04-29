import { fetchJson } from './http'

export async function v1PushSubscriptionExists(endpoint: string): Promise<{ data: boolean | null; error: string | null }> {
  const ep = endpoint.trim()
  const qs = new URLSearchParams({ endpoint: ep })
  const r = await fetchJson<{ exists: boolean }>(`/api/v1/me/push-subscriptions/exists?${qs.toString()}`, { method: 'GET', auth: true })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.exists === true, error: null }
}

export async function v1UpsertPushSubscription(args: {
  endpoint: string
  subscription: unknown
  user_agent: string | null
}): Promise<{ error: string | null }> {
  const r = await fetchJson<{ ok: true }>(`/api/v1/me/push-subscriptions`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({
      endpoint: args.endpoint,
      subscription: args.subscription,
      user_agent: args.user_agent,
    }),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

export async function v1DeletePushSubscription(endpoint: string): Promise<{ error: string | null }> {
  const ep = endpoint.trim()
  const qs = new URLSearchParams({ endpoint: ep })
  const r = await fetchJson<{ ok: true }>(`/api/v1/me/push-subscriptions?${qs.toString()}`, { method: 'DELETE', auth: true })
  return r.ok ? { error: null } : { error: r.error.message }
}

