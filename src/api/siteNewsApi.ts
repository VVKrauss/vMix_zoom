import { fetchJson } from './http'

export type SiteNewsItem = {
  id: string
  published_at: string
  title: string
  body: string
  image_url: string | null
  created_at: string
  updated_at: string
}

export async function v1ListSiteNews(opts?: { limit?: number }): Promise<{ data: SiteNewsItem[] | null; error: string | null }> {
  const limitRaw = typeof opts?.limit === 'number' ? opts.limit : undefined
  const limit = limitRaw && Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : null
  const url = limit ? `/api/v1/site-news?limit=${encodeURIComponent(String(limit))}` : '/api/v1/site-news'
  const r = await fetchJson<{ rows: SiteNewsItem[] }>(url, { method: 'GET', auth: false })
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? ((r.data as any).rows as SiteNewsItem[]) : []
  return { data: rows, error: null }
}

export async function v1InsertSiteNews(row: {
  published_at: string
  title: string
  body: string
  image_url?: string | null
}): Promise<{ error: string | null }> {
  const r = await fetchJson<{ ok: true }>('/api/v1/site-news', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({
      published_at: row.published_at.trim(),
      title: row.title.trim(),
      body: row.body.trim(),
      image_url: row.image_url?.trim() || null,
    }),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

export async function v1UpdateSiteNews(
  id: string,
  row: {
    published_at: string
    title: string
    body: string
    image_url?: string | null
  },
): Promise<{ error: string | null }> {
  const r = await fetchJson<{ ok: true }>(`/api/v1/site-news/${encodeURIComponent(id.trim())}`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({
      published_at: row.published_at.trim(),
      title: row.title.trim(),
      body: row.body.trim(),
      image_url: row.image_url?.trim() || null,
    }),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

export async function v1DeleteSiteNews(id: string): Promise<{ error: string | null }> {
  const r = await fetchJson<{ ok: true }>(`/api/v1/site-news/${encodeURIComponent(id.trim())}`, { method: 'DELETE', auth: true })
  return r.ok ? { error: null } : { error: r.error.message }
}

