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
  return { data: [], error: 'not_migrated' }
}

export async function insertSiteNews(row: {
  published_at: string
  title: string
  body: string
  image_url?: string | null
}): Promise<{ error: string | null }> {
  void row
  return { error: 'not_migrated' }
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
  void id
  void row
  return { error: 'not_migrated' }
}

export async function deleteSiteNews(id: string): Promise<{ error: string | null }> {
  void id
  return { error: 'not_migrated' }
}
