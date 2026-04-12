import { supabase } from './supabase'

/** Постоянная комната — строка в БД сохраняется при выходе хоста (закрыта, но не удалена). Временная — как раньше, без долгой ссылки. */
export type SpaceRoomLifecycleKind = 'permanent' | 'temporary'

export type SpaceRoomChatVisibility = 'everyone' | 'authenticated_only' | 'staff_only' | 'closed'

export const SPACE_ROOM_DISPLAY_NAME_MAX = 160
export const SPACE_ROOM_AVATAR_URL_MAX = 2048

export type SpaceRoomCreateOptions = {
  lifecycle: SpaceRoomLifecycleKind
  chatVisibility: SpaceRoomChatVisibility
  /** Имя в списке «Мои комнаты» и UI; URL остаётся по slug. */
  displayName?: string | null
  avatarUrl?: string | null
  /** Политика гостей (произвольный JSON для клиента). */
  guestPolicy?: Record<string, unknown> | null
  /** Намерение: не пускать гостей без создателя-хоста в эфире (исполнение в приложении). */
  requireCreatorHostForJoin?: boolean
}

/** Варианты видимости чата при создании комнаты (экран входа / хост). */
export const SPACE_ROOM_HOST_CREATE_CHAT_OPTIONS: {
  value: SpaceRoomChatVisibility
  label: string
  hint: string
}[] = [
  { value: 'everyone', label: 'Все участники', hint: 'Гости и зарегистрированные' },
  { value: 'authenticated_only', label: 'Только с аккаунтом', hint: 'Гости не видят чат' },
  { value: 'staff_only', label: 'Хост и админы', hint: 'Только организатор и персонал платформы' },
  { value: 'closed', label: 'Закрыт', hint: 'Сообщения видны, отправка отключена для всех' },
]

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

function parseGuestPolicyFromStorage(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

export function takeSpaceRoomCreateOptions(slug: string): SpaceRoomCreateOptions | null {
  const trimmed = slug.trim()
  if (!trimmed) return null
  const key = CREATE_OPTS_PREFIX + trimmed
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    sessionStorage.removeItem(key)
    const p = JSON.parse(raw) as Partial<SpaceRoomCreateOptions> & {
      display_name?: string
      avatar_url?: string
      guest_policy?: unknown
      require_creator_host_for_join?: unknown
    }
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
    const base: SpaceRoomCreateOptions = { lifecycle: p.lifecycle, chatVisibility: cv }
    const dnRaw = typeof p.displayName === 'string' ? p.displayName : typeof p.display_name === 'string' ? p.display_name : ''
    const dn = dnRaw.trim().slice(0, SPACE_ROOM_DISPLAY_NAME_MAX)
    if (dn) base.displayName = dn
    const auRaw =
      typeof p.avatarUrl === 'string' ? p.avatarUrl : typeof p.avatar_url === 'string' ? p.avatar_url : ''
    const au = auRaw.trim().slice(0, SPACE_ROOM_AVATAR_URL_MAX)
    if (au) base.avatarUrl = au
    const gpStored = p.guestPolicy ?? p.guest_policy
    const gp = parseGuestPolicyFromStorage(gpStored)
    if (gp && Object.keys(gp).length > 0) base.guestPolicy = gp
    if (p.requireCreatorHostForJoin === true || p.require_creator_host_for_join === true) {
      base.requireCreatorHostForJoin = true
    }
    return base
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

export type SpaceRoomJoinDenial =
  | 'none'
  | 'invite_expired'
  | 'closed_or_missing'
  | 'banned'
  | 'approval_required'

export async function getSpaceRoomJoinStatus(
  slug: string,
  authUserId?: string | null,
): Promise<{ joinable: boolean; denial: SpaceRoomJoinDenial; isDbHost: boolean }> {
  const trimmed = slug.trim()
  if (!trimmed) return { joinable: false, denial: 'closed_or_missing', isDbHost: false }
  if (matchesPendingHostClaim(trimmed) || isSessionHostFor(trimmed)) {
    return { joinable: true, denial: 'none', isDbHost: false }
  }
  const { data, error } = await supabase
    .from('space_rooms')
    .select('status, host_user_id, retain_instance, access_mode, created_at, banned_user_ids, approved_joiners')
    .eq('slug', trimmed)
    .maybeSingle()
  if (error) {
    console.warn('getSpaceRoomJoinStatus:', error.message)
    return { joinable: false, denial: 'closed_or_missing', isDbHost: false }
  }
  if (!data || data.status !== 'open') {
    return { joinable: false, denial: 'closed_or_missing', isDbHost: false }
  }

  const hostId = typeof data.host_user_id === 'string' ? data.host_user_id : null
  const isDbHost = Boolean(authUserId && hostId && authUserId === hostId)

  // Проверка бана раньше всего остального
  const bannedIds: string[] = Array.isArray(data.banned_user_ids) ? data.banned_user_ids : []
  if (authUserId && bannedIds.includes(authUserId)) {
    return { joinable: false, denial: 'banned', isDbHost: false }
  }

  // Хост всегда входит
  if (isDbHost) {
    return { joinable: true, denial: 'none', isDbHost: true }
  }

  const accessMode = typeof data.access_mode === 'string' ? data.access_mode : 'link'

  if (accessMode === 'approval') {
    const approvedIds: string[] = Array.isArray(data.approved_joiners) ? data.approved_joiners : []
    if (authUserId && approvedIds.includes(authUserId)) {
      return { joinable: true, denial: 'none', isDbHost: false }
    }
    return { joinable: false, denial: 'approval_required', isDbHost: false }
  }

  if (accessMode === 'invite_only') {
    return { joinable: false, denial: 'invite_expired', isDbHost: false }
  }

  const retain = Boolean(data.retain_instance)
  if (!retain && accessMode === 'link') {
    const createdMs = new Date(String(data.created_at ?? '')).getTime()
    if (
      !Number.isNaN(createdMs) &&
      Date.now() - createdMs > SPACE_ROOM_TEMPORARY_INVITE_MINUTES * 60_000
    ) {
      // Окно прямой ссылки истекло, но комната ещё открыта — переводим на ручное одобрение
      return { joinable: false, denial: 'approval_required', isDbHost: false }
    }
  }

  return { joinable: true, denial: 'none', isDbHost: false }
}

/** @deprecated Используйте getSpaceRoomJoinStatus для различения причин отказа. */
export async function isSpaceRoomJoinable(slug: string, authUserId?: string | null): Promise<boolean> {
  const { joinable } = await getSpaceRoomJoinStatus(slug, authUserId)
  return joinable
}

/** Постоянные комнаты пользователя как хоста (`retain_instance`), для кабинета «Мои комнаты». */
export type PersistentSpaceRoomRow = {
  slug: string
  status: string
  accessMode: string
  chatVisibility: SpaceRoomChatVisibility
  createdAt: string
  displayName: string | null
  avatarUrl: string | null
  guestPolicy: Record<string, unknown>
  requireCreatorHostForJoin: boolean
}

export async function fetchPersistentSpaceRoomsForUser(
  userId: string,
): Promise<{ data: PersistentSpaceRoomRow[] | null; error: string | null }> {
  const uid = userId.trim()
  if (!uid) return { data: [], error: null }

  const { data, error } = await supabase
    .from('space_rooms')
    .select(
      'slug, status, access_mode, chat_visibility, created_at, display_name, avatar_url, guest_policy, require_creator_host_for_join',
    )
    .eq('host_user_id', uid)
    .eq('retain_instance', true)
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }

  const rows = (data ?? []).map((r) => {
    const gpRaw = r.guest_policy
    const guestPolicy =
      gpRaw != null && typeof gpRaw === 'object' && !Array.isArray(gpRaw) ? (gpRaw as Record<string, unknown>) : {}
    return {
      slug: typeof r.slug === 'string' ? r.slug : '',
      status: typeof r.status === 'string' ? r.status : '',
      accessMode: typeof r.access_mode === 'string' ? r.access_mode : '',
      chatVisibility: isChatVisibility(r.chat_visibility as string)
        ? (r.chat_visibility as SpaceRoomChatVisibility)
        : 'everyone',
      createdAt: typeof r.created_at === 'string' ? r.created_at : '',
      displayName:
        typeof r.display_name === 'string' && r.display_name.trim()
          ? r.display_name.trim().slice(0, SPACE_ROOM_DISPLAY_NAME_MAX)
          : null,
      avatarUrl:
        typeof r.avatar_url === 'string' && r.avatar_url.trim()
          ? r.avatar_url.trim().slice(0, SPACE_ROOM_AVATAR_URL_MAX)
          : null,
      guestPolicy,
      requireCreatorHostForJoin: r.require_creator_host_for_join === true,
    }
  })

  return { data: rows.filter((r) => r.slug), error: null }
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

  const insertPayload: Record<string, unknown> = {
    slug: trimmed,
    host_user_id: userId,
    status: 'open',
    retain_instance: retainInstance,
    access_mode: 'link',
    chat_visibility: chatVisibility,
  }
  const displayName = typeof opts?.displayName === 'string' ? opts.displayName.trim() : ''
  if (displayName) insertPayload.display_name = displayName.slice(0, SPACE_ROOM_DISPLAY_NAME_MAX)
  const avatarUrl = typeof opts?.avatarUrl === 'string' ? opts.avatarUrl.trim() : ''
  if (avatarUrl) insertPayload.avatar_url = avatarUrl.slice(0, SPACE_ROOM_AVATAR_URL_MAX)
  if (opts?.guestPolicy && typeof opts.guestPolicy === 'object' && !Array.isArray(opts.guestPolicy)) {
    insertPayload.guest_policy = opts.guestPolicy
  }
  if (opts?.requireCreatorHostForJoin === true) {
    insertPayload.require_creator_host_for_join = true
  }

  const { error } = await supabase.from('space_rooms').insert(insertPayload)
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

/** Заблокировать пользователя в комнате (только хост). Read-modify-write. */
export async function banUserFromSpaceRoom(
  slug: string,
  hostUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed || !hostUserId || !targetUserId) return false
  const { data: row } = await supabase
    .from('space_rooms')
    .select('banned_user_ids')
    .eq('slug', trimmed)
    .eq('host_user_id', hostUserId)
    .maybeSingle()
  if (!row) return false
  const current: string[] = Array.isArray(row.banned_user_ids) ? row.banned_user_ids : []
  if (current.includes(targetUserId)) return true
  const { error } = await supabase
    .from('space_rooms')
    .update({ banned_user_ids: [...current, targetUserId], updated_at: new Date().toISOString() })
    .eq('slug', trimmed)
    .eq('host_user_id', hostUserId)
  if (error) {
    console.warn('banUserFromSpaceRoom:', error.message)
    return false
  }
  return true
}

/** Одобрить вход пользователя (только хост, access_mode=approval). */
export async function approveSpaceRoomJoiner(
  slug: string,
  hostUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed || !hostUserId || !targetUserId) return false
  const { data: row } = await supabase
    .from('space_rooms')
    .select('approved_joiners')
    .eq('slug', trimmed)
    .eq('host_user_id', hostUserId)
    .maybeSingle()
  if (!row) return false
  const current: string[] = Array.isArray(row.approved_joiners) ? row.approved_joiners : []
  if (current.includes(targetUserId)) return true
  const { error } = await supabase
    .from('space_rooms')
    .update({ approved_joiners: [...current, targetUserId], updated_at: new Date().toISOString() })
    .eq('slug', trimmed)
    .eq('host_user_id', hostUserId)
  if (error) {
    console.warn('approveSpaceRoomJoiner:', error.message)
    return false
  }
  return true
}

/** Убрать пользователя из списка ожидающих (отклонить или очистить после входа). */
export async function removeSpaceRoomApprovedJoiner(
  slug: string,
  hostUserId: string,
  targetUserId: string,
): Promise<void> {
  const trimmed = slug.trim()
  if (!trimmed || !hostUserId || !targetUserId) return
  const { data: row } = await supabase
    .from('space_rooms')
    .select('approved_joiners')
    .eq('slug', trimmed)
    .eq('host_user_id', hostUserId)
    .maybeSingle()
  if (!row) return
  const current: string[] = Array.isArray(row.approved_joiners) ? row.approved_joiners : []
  const next = current.filter((id) => id !== targetUserId)
  if (next.length === current.length) return
  await supabase
    .from('space_rooms')
    .update({ approved_joiners: next, updated_at: new Date().toISOString() })
    .eq('slug', trimmed)
    .eq('host_user_id', hostUserId)
}

/** Добавить комнату в режим approval (хост устанавливает). */
export async function updateSpaceRoomAccessMode(
  slug: string,
  hostUserId: string,
  mode: 'link' | 'approval' | 'invite_only',
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed || !hostUserId) return false
  const { error, data } = await supabase
    .from('space_rooms')
    .update({ access_mode: mode, updated_at: new Date().toISOString() })
    .eq('slug', trimmed)
    .eq('host_user_id', hostUserId)
    .select('slug')
    .maybeSingle()
  if (error) {
    console.warn('updateSpaceRoomAccessMode:', error.message)
    return false
  }
  return Boolean(data?.slug)
}
