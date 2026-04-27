import type { Pool } from 'pg'

export async function listSiteNews(pool: Pool): Promise<unknown[]> {
  const r = await pool.query(
    `select id, published_at, title, body, image_url, created_at, updated_at
       from public.site_news
      order by published_at desc, created_at desc`,
  )
  return r.rows
}

export async function insertSiteNews(
  pool: Pool,
  args: { published_at: string; title: string; body: string; image_url: string | null },
): Promise<void> {
  await pool.query(
    `insert into public.site_news (published_at, title, body, image_url, created_at, updated_at)
     values ($1::date, $2, $3, $4, now(), now())`,
    [args.published_at, args.title, args.body, args.image_url],
  )
}

export async function updateSiteNews(
  pool: Pool,
  args: { id: string; published_at: string; title: string; body: string; image_url: string | null },
): Promise<void> {
  await pool.query(
    `update public.site_news
        set published_at = $2::date,
            title = $3,
            body = $4,
            image_url = $5,
            updated_at = now()
      where id = $1`,
    [args.id, args.published_at, args.title, args.body, args.image_url],
  )
}

export async function deleteSiteNews(pool: Pool, id: string): Promise<void> {
  await pool.query(`delete from public.site_news where id = $1`, [id])
}

