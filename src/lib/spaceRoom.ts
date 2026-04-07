import { supabase } from './supabase'

export const PENDING_HOST_CLAIM_KEY = 'vmix_pending_host_claim'
export const HOST_SESSION_KEY = 'vmix_i_am_host_for'

export function clearPendingHostClaim(): void {
  try {
    sessionStorage.removeItem(PENDING_HOST_CLAIM_KEY)
  } catch {
    /* noop */
  }
}

export function matchesPendingHostClaim(slug: string): boolean {
  try {
    return sessionStorage.getItem(PENDING_HOST_CLAIM_KEY) === slug.trim()
  } catch {
    return false
  }
}

export function setPendingHostClaim(slug: string): void {
  try {
    sessionStorage.setItem(PENDING_HOST_CLAIM_KEY, slug)
  } catch {
    /* noop */
  }
}

export function markSessionAsHostFor(slug: string): void {
  try {
    sessionStorage.setItem(HOST_SESSION_KEY, slug)
  } catch {
    /* noop */
  }
}

export function clearHostSessionIfMatches(slug: string): void {
  try {
    if (sessionStorage.getItem(HOST_SESSION_KEY) === slug) {
      sessionStorage.removeItem(HOST_SESSION_KEY)
    }
  } catch {
    /* noop */
  }
}

export function isSessionHostFor(slug: string): boolean {
  try {
    return sessionStorage.getItem(HOST_SESSION_KEY) === slug
  } catch {
    return false
  }
}

export async function isSpaceRoomJoinable(slug: string): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed) return false
  const { data, error } = await supabase
    .from('space_rooms')
    .select('status')
    .eq('slug', trimmed)
    .maybeSingle()
  if (error) return true
  if (!data) return true
  return data.status === 'open'
}

export async function registerSpaceRoomAsHost(slug: string, userId: string): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed) return false
  const { error } = await supabase.from('space_rooms').insert({
    slug: trimmed,
    host_user_id: userId,
    status: 'open',
    retain_instance: false,
  })
  if (error) {
    if (error.code === '23505') return false
    console.warn('registerSpaceRoomAsHost:', error.message)
    return false
  }
  return true
}

export async function hostLeaveSpaceRoom(slug: string): Promise<void> {
  const trimmed = slug.trim()
  if (!trimmed) return
  await supabase.rpc('host_leave_space_room', { p_slug: trimmed })
}
