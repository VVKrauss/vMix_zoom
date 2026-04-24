import { buildAutoProfileSlug } from './profileSlug'

const ASSIGN_ATTEMPTS = 14

/** Кто занял slug: null — свободен, строка — id пользователя. */
export async function fetchProfileSlugOwner(
  slug: string,
): Promise<{ userId: string | null; error: string | null }> {
  void slug
  return { userId: null, error: 'not_migrated' }
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
  void userId
  void nowMs
  void buildAutoProfileSlug
  return { slug: null, error: 'not_migrated' }
}
