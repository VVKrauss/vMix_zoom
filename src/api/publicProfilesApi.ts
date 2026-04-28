import { fetchJson } from './http'

export async function v1GetUserPublicProfileBySlug(slug: string): Promise<{ data: any | null; error: string | null }> {
  const s = slug.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/users/public/by-slug/${encodeURIComponent(s)}`, { method: 'GET', auth: true })
  if (!r.ok) {
    // allow anonymous view: retry without auth
    const r2 = await fetchJson<{ data: any }>(`/api/v1/users/public/by-slug/${encodeURIComponent(s)}`, { method: 'GET', auth: false })
    return r2.ok ? { data: (r2.data as any)?.data ?? null, error: null } : { data: null, error: r2.error.message }
  }
  return { data: (r.data as any)?.data ?? null, error: null }
}

