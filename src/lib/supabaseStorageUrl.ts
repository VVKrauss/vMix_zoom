/**
 * Публичные объекты Storage когда сохранялись как абсолютный URL с другим host (старый Cloud-проект,
 * другой self-hosted). Переписываем origin на текущий `VITE_SUPABASE_URL`, путь и query сохраняем.
 */
const STORAGE_OBJECT_PUBLIC_PREFIX = '/storage/v1/object/public/'

/** Старые записи без сегмента `public` (например `/object/avatars/...` вместо `/object/public/avatars/...`) дают 400. */
function injectMissingPublicStorageSegment(pathname: string): string {
  const m = pathname.match(/^(\/storage\/v1\/object)\/(?!public\/|sign\/|authenticated\/)([^/]+)(.*)$/)
  if (!m) return pathname
  return `${m[1]}/public/${m[2]}${m[3]}`
}

export function normalizeSupabaseStoragePublicUrl(url: string | null | undefined): string | null {
  const u = typeof url === 'string' ? url.trim() : ''
  if (!u) return null
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return u
  }
  const pathBefore = parsed.pathname
  parsed.pathname = injectMissingPublicStorageSegment(parsed.pathname)
  const pathFixed = pathBefore !== parsed.pathname
  if (!base) return pathFixed ? parsed.toString() : u
  if (!parsed.pathname.startsWith(STORAGE_OBJECT_PUBLIC_PREFIX)) return pathFixed ? parsed.toString() : u
  let baseParsed: URL
  try {
    baseParsed = new URL(base)
  } catch {
    return pathFixed ? parsed.toString() : u
  }
  if (parsed.origin === baseParsed.origin) return pathFixed ? parsed.toString() : u
  return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`
}
