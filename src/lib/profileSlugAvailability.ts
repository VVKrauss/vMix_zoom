import { supabase } from './supabase'
import { buildAutoProfileSlug } from './profileSlug'

const ASSIGN_ATTEMPTS = 14

/** Кто занял slug: null — свободен, строка — id пользователя. */
export async function fetchProfileSlugOwner(
  slug: string,
): Promise<{ userId: string | null; error: string | null }> {
  const s = slug.trim()
  if (!s) return { userId: null, error: null }
  const { data, error } = await supabase.from('users').select('id').eq('profile_slug', s).maybeSingle()
  if (error) return { userId: null, error: error.message }
  const id = typeof (data as { id?: string } | null)?.id === 'string' ? (data as { id: string }).id : null
  return { userId: id, error: null }
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

    const { data, error } = await supabase
      .from('users')
      .update({ profile_slug: candidate, updated_at: new Date().toISOString() })
      .eq('id', uid)
      .is('profile_slug', null)
      .select('id')
      .maybeSingle()

    if (error) {
      if (error.code === '23505') continue
      return { slug: null, error: error.message }
    }
    if (data) return { slug: candidate, error: null }
    /* Уже заполнили в другой вкладке */
    return { slug: null, error: null }
  }
  return { slug: null, error: 'Не удалось подобрать свободный ник, попробуйте позже.' }
}
