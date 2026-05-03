/**
 * Публичные объекты Storage когда сохранялись как абсолютный URL с другим host (старый Cloud-проект,
 * другой self-hosted). Переписываем origin на текущий `VITE_SUPABASE_URL`, путь и query сохраняем.
 */
const STORAGE_OBJECT_PUBLIC_PREFIX = '/storage/v1/object/public/'

export function normalizeSupabaseStoragePublicUrl(url: string | null | undefined): string | null {
  const u = typeof url === 'string' ? url.trim() : ''
  if (!u) return null
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''
  if (!base) return u
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return u
  }
  if (!parsed.pathname.startsWith(STORAGE_OBJECT_PUBLIC_PREFIX)) return u
  let baseParsed: URL
  try {
    baseParsed = new URL(base)
  } catch {
    return u
  }
  if (parsed.origin === baseParsed.origin) return u
  return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`
}
