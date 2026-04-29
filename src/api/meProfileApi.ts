import { fetchJson } from './http'

export async function v1GetMeProfile(): Promise<{ data: any | null; error: string | null }> {
  const r = await fetchJson<any>('/api/v1/me/profile', { method: 'GET', auth: true })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: r.data as any, error: null }
}

export async function v1PatchMeProfile(patch: Record<string, unknown>): Promise<{ error: string | null }> {
  const r = await fetchJson<{ ok: true }>('/api/v1/me/profile', {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(patch ?? {}),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

