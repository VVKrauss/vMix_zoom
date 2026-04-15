import { supabase } from './supabase'

export type LinkPreview = {
  url: string
  title?: string
  description?: string
  image?: string
  siteName?: string
}

export async function fetchLinkPreview(url: string): Promise<{ data: LinkPreview | null; error: string | null }> {
  const u = url.trim()
  if (!u) return { data: null, error: 'empty_url' }
  const { data, error } = await supabase.functions.invoke('link-preview', { body: { url: u } })
  if (error) return { data: null, error: error.message }
  if (!data || typeof data !== 'object') return { data: null, error: 'bad_preview' }
  const r = data as Record<string, unknown>
  const out: LinkPreview = { url: typeof r.url === 'string' && r.url.trim() ? r.url.trim() : u }
  if (typeof r.title === 'string' && r.title.trim()) out.title = r.title.trim()
  if (typeof r.description === 'string' && r.description.trim()) out.description = r.description.trim()
  if (typeof r.image === 'string' && r.image.trim()) out.image = r.image.trim()
  const siteName = (typeof r.siteName === 'string' && r.siteName.trim()
    ? r.siteName
    : typeof r.site_name === 'string' && r.site_name.trim()
      ? r.site_name
      : '') as string
  if (siteName.trim()) out.siteName = siteName.trim()
  return { data: out, error: null }
}

