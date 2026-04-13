import { supabase } from './supabase'

export type SiteNewsItem = {
  id: string
  published_at: string
  title: string
  body: string
  image_url: string | null
  created_at: string
  updated_at: string
}

export async function listSiteNews(): Promise<{ data: SiteNewsItem[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('site_news')
    .select('id, published_at, title, body, image_url, created_at, updated_at')
    .order('published_at', { ascending: false })

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as SiteNewsItem[], error: null }
}

export async function insertSiteNews(row: {
  published_at: string
  title: string
  body: string
  image_url?: string | null
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('site_news').insert({
    published_at: row.published_at.trim(),
    title: row.title.trim(),
    body: row.body.trim(),
    image_url: row.image_url?.trim() || null,
  })
  return { error: error?.message ?? null }
}

export async function updateSiteNews(
  id: string,
  row: {
    published_at: string
    title: string
    body: string
    image_url?: string | null
  },
): Promise<{ error: string | null }> {
  const image_url = row.image_url?.trim() || null
  const { error } = await supabase
    .from('site_news')
    .update({
      published_at: row.published_at.trim(),
      title: row.title.trim(),
      body: row.body.trim(),
      image_url,
    })
    .eq('id', id.trim())
  return { error: error?.message ?? null }
}

export async function deleteSiteNews(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('site_news').delete().eq('id', id.trim())
  return { error: error?.message ?? null }
}
