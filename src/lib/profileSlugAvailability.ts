import { dbTableSelectOne, dbTableUpdate } from '../api/dbApi'
import { buildAutoProfileSlug } from './profileSlug'

const ASSIGN_ATTEMPTS = 14

/** Кто занял slug: null — свободен, строка — id пользователя. */
export async function fetchProfileSlugOwner(
  slug: string,
): Promise<{ userId: string | null; error: string | null }> {
  const s = slug.trim()
  if (!s) return { userId: null, error: null }
  const r = await dbTableSelectOne<{ id: string }>({
    table: 'users',
    select: 'id',
    filters: { profile_slug: s },
  })
  if (!r.ok) return { userId: null, error: r.error.message }
  return { userId: r.data.row?.id ?? null, error: null }
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

  for (let i = 0; i < ASSIGN_ATTEMPTS; i++) {
    const candidate = buildAutoProfileSlug(nowMs + i * 17)
    const free = await isProfileSlugAvailable(candidate, uid)
    if (!free) continue

    const upd = await dbTableUpdate({
      table: 'users',
      patch: { profile_slug: candidate, updated_at: new Date().toISOString() },
      filters: { id: uid, profile_slug__is: null },
    })
    if (!upd.ok) {
      // backend должен маппить unique violation на понятный код; временно — по сообщению.
      if (String(upd.error.message).includes('23505')) continue
      return { slug: null, error: upd.error.message }
    }
    return { slug: candidate, error: null }
  }
  return { slug: null, error: 'Не удалось подобрать свободный ник, попробуйте позже.' }
}
