import { fetchJson } from '../api/http'

/** Кто занял slug: null — свободен, строка — id пользователя. */
export async function fetchProfileSlugOwner(
  slug: string,
): Promise<{ userId: string | null; error: string | null }> {
  const s = slug.trim()
  if (!s) return { userId: null, error: null }
  const r = await fetchJson<{ userId: string | null }>(`/api/v1/public/profile-slug/${encodeURIComponent(s)}/owner`, { method: 'GET' })
  if (!r.ok) return { userId: null, error: r.error.message }
  return { userId: r.data.userId ?? null, error: null }
}

export async function isProfileSlugAvailable(slug: string, excludeUserId: string): Promise<boolean> {
  const { userId, error } = await fetchProfileSlugOwner(slug)
  if (error) return false
  if (!userId) return true
  return userId === excludeUserId
}

/** Если в БД `profile_slug` ещё null — записать уникальный автоник. */
export async function assignAutoProfileSlugIfEmpty(
  userId: string,
  nowMs: number = Date.now(),
): Promise<{ slug: string | null; error: string | null }> {
  const uid = userId.trim()
  if (!uid) return { slug: null, error: 'Нет пользователя' }
  // Server-side: try to assign a random slug if `profile_slug` is still NULL.
  // `nowMs` is kept for backward compatibility but is no longer used on the client.
  void nowMs
  const r = await fetchJson<any>(`/api/v1/me/profile/assign-auto-slug-if-empty`, { method: 'POST', auth: true, body: '{}' })
  if (!r.ok) return { slug: null, error: r.error.message }
  if (r.data?.ok !== true) return { slug: null, error: 'Не удалось подобрать свободный ник, попробуйте позже.' }
  const slug = typeof r.data.slug === 'string' && r.data.slug.trim() ? r.data.slug.trim() : null
  return { slug, error: null }
}
