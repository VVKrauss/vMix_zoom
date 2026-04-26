import { fetchJson } from './http'

export async function legacyRpc(name: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: string | null }> {
  const n = name.trim()
  const r = await fetchJson<any>(`/api/db/rpc/${encodeURIComponent(n)}`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ args }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: r.data as any, error: null }
}

