import { fetchJson } from './http'

export async function v1DeleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const r = await fetchJson<{ data: any }>('/api/v1/me/delete-account', { method: 'POST', auth: true, body: JSON.stringify({}) })
  if (!r.ok) return { ok: false, error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { ok: false, error: typeof data?.error === 'string' ? data.error : 'delete_failed' }
  return { ok: true }
}

