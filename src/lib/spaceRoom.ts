import { supabase } from './supabase'

/** Постоянная комната — строка в БД сохраняется при выходе хоста (закрыта, но не удалена). Временная — как раньше, без долгой ссылки. */
export type SpaceRoomLifecycleKind = 'permanent' | 'temporary'

export type SpaceRoomChatVisibility = 'everyone' | 'authenticated_only' | 'staff_only' | 'closed'

export type SpaceRoomCreateOptions = {
  lifecycle: SpaceRoomLifecycleKind
  chatVisibility: SpaceRoomChatVisibility
}

/** Срок «горячей» ссылки для временной комнаты (минуты). */
export const SPACE_ROOM_TEMPORARY_INVITE_MINUTES = 2

const CREATE_OPTS_PREFIX = 'vmix_space_room_create:'

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

export function stashSpaceRoomCreateOptions(slug: string, opts: SpaceRoomCreateOptions): void {
  const trimmed = slug.trim()
  if (!trimmed) return
  try {
    sessionStorage.setItem(CREATE_OPTS_PREFIX + trimmed, JSON.stringify(opts))
  } catch {
    /* noop */
  }
}

export function takeSpaceRoomCreateOptions(slug: string): SpaceRoomCreateOptions | null {
  const trimmed = slug.trim()
  if (!trimmed) return null
  const key = CREATE_OPTS_PREFIX + trimmed
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    sessionStorage.removeItem(key)
    const p = JSON.parse(raw) as Partial<SpaceRoomCreateOptions>
    if (p.lifecycle !== 'permanent' && p.lifecycle !== 'temporary') return null
    const cv = p.chatVisibility
    if (
      cv !== 'everyone' &&
      cv !== 'authenticated_only' &&
      cv !== 'staff_only' &&
      cv !== 'closed'
    ) {
      return null
    }
    return { lifecycle: p.lifecycle, chatVisibility: cv }
  } catch {
    return null
  }
}

function isChatVisibility(v: string | null | undefined): v is SpaceRoomChatVisibility {
  return (
    v === 'everyone' ||
    v === 'authenticated_only' ||
    v === 'staff_only' ||
    v === 'closed'
  )
}

/** Видит панель чата (сообщения). */
export function participantCanSeeRoomChat(
  visibility: SpaceRoomChatVisibility,
  ctx: { isAuthed: boolean; isDbHost: boolean; isElevatedStaff: boolean },
): boolean {
  switch (visibility) {
    case 'everyone':
      return true
    case 'authenticated_only':
      return ctx.isAuthed
    case 'staff_only':
      return ctx.isDbHost || ctx.isElevatedStaff
    case 'closed':
      return true
    default:
      return true
  }
}

/** Может отправлять сообщения в чат комнаты. */
export function participantCanPostRoomChat(
  visibility: SpaceRoomChatVisibility,
  ctx: { isAuthed: boolean; isDbHost: boolean; isElevatedStaff: boolean },
): boolean {
  switch (visibility) {
    case 'everyone':
      return true
    case 'authenticated_only':
      return ctx.isAuthed
    case 'staff_only':
      return ctx.isDbHost || ctx.isElevatedStaff
    case 'closed':
      return false
    default:
      return true
  }
}

export type SpaceRoomJoinDenial = 'none' | 'invite_expired' | 'closed_or_missing'

export async function getSpaceRoomJoinStatus(
  slug: string,
  authUserId?: string | null,
): Promise<{ joinable: boolean; denial: SpaceRoomJoinDenial }> {
  const trimmed = slug.trim()
  if (!trimmed) return { joinable: false, denial: 'closed_or_missing' }
  if (matchesPendingHostClaim(trimmed) || isSessionHostFor(trimmed)) {
    return { joinable: true, denial: 'none' }
  }
  const { data, error } = await supabase
    .from('space_rooms')
    .select('status, host_user_id, retain_instance, access_mode, created_at')
    .eq('slug', trimmed)
    .maybeSingle()
  if (error) {
    console.warn('getSpaceRoomJoinStatus:', error.message)
    return { joinable: false, denial: 'closed_or_missing' }
  }
  if (!data || data.status !== 'open') return { joinable: false, denial: 'closed_or_missing' }

  const hostId = typeof data.host_user_id === 'string' ? data.host_user_id : null
  if (authUserId && hostId && authUserId === hostId) {
    return { joinable: true, denial: 'none' }
  }

  const accessMode = typeof data.access_mode === 'string' ? data.access_mode : 'link'
  if (accessMode === 'approval' || accessMode === 'invite_only') {
    return { joinable: false, denial: 'invite_expired' }
  }

  const retain = Boolean(data.retain_instance)
  if (!retain && accessMode === 'link') {
    const createdMs = new Date(String(data.created_at ?? '')).getTime()
    if (
      !Number.isNaN(createdMs) &&
      Date.now() - createdMs > SPACE_ROOM_TEMPORARY_INVITE_MINUTES * 60_000
    ) {
      return { joinable: false, denial: 'invite_expired' }
    }
  }

  return { joinable: true, denial: 'none' }
}

/** @deprecated Используйте getSpaceRoomJoinStatus для различения причин отказа. */
export async function isSpaceRoomJoinable(slug: string, authUserId?: string | null): Promise<boolean> {
  const { joinable } = await getSpaceRoomJoinStatus(slug, authUserId)
  return joinable
}

export async function registerSpaceRoomAsHost(
  slug: string,
  userId: string,
  createOptions?: SpaceRoomCreateOptions | null,
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed) return false
  const opts = createOptions === undefined ? null : createOptions
  const permanent = opts?.lifecycle === 'permanent'
  const retainInstance = opts == null ? false : permanent
  const chatVisibility =
    opts?.chatVisibility && isChatVisibility(opts.chatVisibility) ? opts.chatVisibility : 'everyone'

  const { error } = await supabase.from('space_rooms').insert({
    slug: trimmed,
    host_user_id: userId,
    status: 'open',
    retain_instance: retainInstance,
    access_mode: 'link',
    chat_visibility: chatVisibility,
  })
  if (error) {
    if (error.code === '23505') return false
    console.warn('registerSpaceRoomAsHost:', error.message)
    return false
  }
  return true
}

export async function updateSpaceRoomChatVisibility(
  slug: string,
  userId: string,
  visibility: SpaceRoomChatVisibility,
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed || !userId) return false
  if (!isChatVisibility(visibility)) return false
  const { error, data } = await supabase
    .from('space_rooms')
    .update({ chat_visibility: visibility, updated_at: new Date().toISOString() })
    .eq('slug', trimmed)
    .eq('host_user_id', userId)
    .select('slug')
    .maybeSingle()
  if (error) {
    console.warn('updateSpaceRoomChatVisibility:', error.message)
    return false
  }
  return Boolean(data?.slug)
}

export async function hostLeaveSpaceRoom(slug: string): Promise<void> {
  const trimmed = slug.trim()
  if (!trimmed) return
  await supabase.rpc('host_leave_space_room', { p_slug: trimmed })
}
