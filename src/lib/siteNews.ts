import { v1DeleteSiteNews, v1InsertSiteNews, v1ListSiteNews, v1UpdateSiteNews } from '../api/siteNewsApi'

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
  return await v1ListSiteNews()
}

export async function insertSiteNews(row: {
  published_at: string
  title: string
  body: string
  image_url?: string | null
}): Promise<{ error: string | null }> {
  return await v1InsertSiteNews(row)
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
  return await v1UpdateSiteNews(id, row)
}

export async function deleteSiteNews(id: string): Promise<{ error: string | null }> {
  return await v1DeleteSiteNews(id)
}
