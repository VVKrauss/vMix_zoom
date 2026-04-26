import { fetchJson } from './http'

export async function v1GetAppVersion(): Promise<{ data: string | null; error: string | null }> {
  const r = await fetchJson<{ version: string }>('/api/v1/app-version', { method: 'GET', auth: false })
  if (!r.ok) return { data: null, error: r.error.message }
  const v = typeof (r.data as any)?.version === 'string' ? (r.data as any).version : null
  return { data: v, error: null }
}

