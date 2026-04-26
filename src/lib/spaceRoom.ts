import { dbRpc, dbTableInsert, dbTableSelect, dbTableSelectOne, dbTableUpdate } from '../api/dbApi'

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

/** Короткие подписи для select политики чата в UI. */
export const SPACE_ROOM_CHAT_POLICY_SELECT_OPTIONS: { value: SpaceRoomChatVisibility; label: string }[] = [
  { value: 'everyone', label: 'Все участники' },
  { value: 'authenticated_only', label: 'Только с аккаунтом' },
  { value: 'staff_only', label: 'Хост и админы' },
  { value: 'closed', label: 'Закрыт (только чтение)' },
]

export type SpaceRoomChatParticipantCtx = {
  isAuthed: boolean
  isDbHost: boolean
  isElevatedStaff: boolean
  /** Со-админ комнаты (`space_rooms.room_admin_user_ids`). */
  isRoomSpaceAdmin?: boolean
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

function isRoomModeratorLike(ctx: SpaceRoomChatParticipantCtx): boolean {
  return ctx.isDbHost || ctx.isElevatedStaff || Boolean(ctx.isRoomSpaceAdmin)
}

/** Видит панель чата (сообщения). */
export function participantCanSeeRoomChat(
  visibility: SpaceRoomChatVisibility,
  ctx: SpaceRoomChatParticipantCtx,
): boolean {
  switch (visibility) {
    case 'everyone':
      return true
    case 'authenticated_only':
      return ctx.isAuthed
    case 'staff_only':
      return isRoomModeratorLike(ctx)
    case 'closed':
      return true
    default:
      return true
  }
}

/** Может отправлять сообщения в чат комнаты. */
export function participantCanPostRoomChat(
  visibility: SpaceRoomChatVisibility,
  ctx: SpaceRoomChatParticipantCtx,
): boolean {
  switch (visibility) {
    case 'everyone':
      return true
    case 'authenticated_only':
      return ctx.isAuthed
    case 'staff_only':
      return isRoomModeratorLike(ctx)
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
  const r = await dbTableSelectOne<Record<string, unknown>>({
    table: 'space_rooms',
    select: 'status,host_user_id,retain_instance,access_mode,created_at,banned_user_ids,approved_joiners',
    filters: { slug: trimmed },
  })
  if (!r.ok) {
    console.warn('getSpaceRoomJoinStatus:', r.error.message)
    return { joinable: false, denial: 'closed_or_missing', isDbHost: false }
  }
  const data = r.data.row as any
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
  /** Суммарное время в статусе open (сек), без текущей сессии. */
  cumulativeOpenSeconds: number
  /** Начало текущей открытой сессии (если status=open). */
  openSessionStartedAt: string | null
}

/** Эффективная длительность «эфира»: накоплено + текущая открытая сессия. */
export function spaceRoomEffectiveOpenSeconds(r: {
  cumulativeOpenSeconds: number
  openSessionStartedAt: string | null
  status: string
}): number {
  let t = Math.max(0, r.cumulativeOpenSeconds)
  if (r.status === 'open' && r.openSessionStartedAt) {
    const start = new Date(r.openSessionStartedAt).getTime()
    if (!Number.isNaN(start)) {
      t += Math.max(0, Math.floor((Date.now() - start) / 1000))
    }
  }
  return t
}

export async function fetchPersistentSpaceRoomsForUser(
  userId: string,
): Promise<{ data: PersistentSpaceRoomRow[] | null; error: string | null }> {
  const uid = userId.trim()
  if (!uid) return { data: [], error: null }

  const r = await dbTableSelect<any>({
    table: 'space_rooms',
    select:
      'slug,status,access_mode,chat_visibility,created_at,display_name,avatar_url,guest_policy,require_creator_host_for_join,cumulative_open_seconds,open_session_started_at',
    filters: { host_user_id: uid, retain_instance: true },
    order: [{ column: 'created_at', ascending: false }],
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const data = r.data.rows as any[]

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
      cumulativeOpenSeconds:
        typeof r.cumulative_open_seconds === 'number'
          ? r.cumulative_open_seconds
          : Number(r.cumulative_open_seconds ?? 0) || 0,
      openSessionStartedAt:
        typeof r.open_session_started_at === 'string' ? r.open_session_started_at : null,
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

  const ins = await dbTableInsert({ table: 'space_rooms', row: insertPayload })
  if (!ins.ok) {
    if (String(ins.error.message).includes('23505')) return false
    console.warn('registerSpaceRoomAsHost:', ins.error.message)
    return false
  }
  return true
}

export async function updateSpaceRoomChatVisibility(
  slug: string,
  _actorUserId: string,
  visibility: SpaceRoomChatVisibility,
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed) return false
  if (!isChatVisibility(visibility)) return false
  const upd = await dbTableUpdate({
    table: 'space_rooms',
    patch: { chat_visibility: visibility, updated_at: new Date().toISOString() },
    filters: { slug: trimmed },
  })
  if (!upd.ok) {
    console.warn('updateSpaceRoomChatVisibility:', upd.error.message)
    return false
  }
  return true
}

export async function hostLeaveSpaceRoom(slug: string): Promise<void> {
  const trimmed = slug.trim()
  if (!trimmed) return
  await dbRpc('host_leave_space_room', { p_slug: trimmed })
}

/** Заблокировать пользователя в комнате (хост / staff / со-админ комнаты — RLS). Read-modify-write. */
export async function banUserFromSpaceRoom(
  slug: string,
  _actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed || !targetUserId) return false
  const sel = await dbTableSelectOne<{ banned_user_ids: unknown }>({
    table: 'space_rooms',
    select: 'banned_user_ids',
    filters: { slug: trimmed },
  })
  if (!sel.ok || !sel.data.row) return false
  const current: string[] = Array.isArray((sel.data.row as any).banned_user_ids) ? (sel.data.row as any).banned_user_ids : []
  if (current.includes(targetUserId)) return true
  const upd = await dbTableUpdate({
    table: 'space_rooms',
    patch: { banned_user_ids: [...current, targetUserId], updated_at: new Date().toISOString() },
    filters: { slug: trimmed },
  })
  if (!upd.ok) {
    console.warn('banUserFromSpaceRoom:', upd.error.message)
    return false
  }
  return true
}

/** Одобрить вход пользователя (режим approval; хост / staff / со-админ — RLS). */
export async function approveSpaceRoomJoiner(
  slug: string,
  _actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed || !targetUserId) return false
  const sel = await dbTableSelectOne<{ approved_joiners: unknown }>({
    table: 'space_rooms',
    select: 'approved_joiners',
    filters: { slug: trimmed },
  })
  if (!sel.ok || !sel.data.row) return false
  const current: string[] = Array.isArray((sel.data.row as any).approved_joiners) ? (sel.data.row as any).approved_joiners : []
  if (current.includes(targetUserId)) return true
  const upd = await dbTableUpdate({
    table: 'space_rooms',
    patch: { approved_joiners: [...current, targetUserId], updated_at: new Date().toISOString() },
    filters: { slug: trimmed },
  })
  if (!upd.ok) {
    console.warn('approveSpaceRoomJoiner:', upd.error.message)
    return false
  }
  return true
}

/** Убрать пользователя из списка ожидающих (отклонить или очистить после входа). */
export async function removeSpaceRoomApprovedJoiner(
  slug: string,
  _actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const trimmed = slug.trim()
  if (!trimmed || !targetUserId) return
  const sel = await dbTableSelectOne<{ approved_joiners: unknown }>({
    table: 'space_rooms',
    select: 'approved_joiners',
    filters: { slug: trimmed },
  })
  if (!sel.ok || !sel.data.row) return
  const current: string[] = Array.isArray((sel.data.row as any).approved_joiners) ? (sel.data.row as any).approved_joiners : []
  const next = current.filter((id) => id !== targetUserId)
  if (next.length === current.length) return
  await dbTableUpdate({
    table: 'space_rooms',
    patch: { approved_joiners: next, updated_at: new Date().toISOString() },
    filters: { slug: trimmed },
  })
}

/** Режим входа в комнату (хост / staff / со-админ — RLS). */
export async function updateSpaceRoomAccessMode(
  slug: string,
  _actorUserId: string,
  mode: 'link' | 'approval' | 'invite_only',
): Promise<boolean> {
  const trimmed = slug.trim()
  if (!trimmed) return false
  const upd = await dbTableUpdate({
    table: 'space_rooms',
    patch: { access_mode: mode, updated_at: new Date().toISOString() },
    filters: { slug: trimmed },
  })
  if (!upd.ok) {
    console.warn('updateSpaceRoomAccessMode:', upd.error.message)
    return false
  }
  return true
}

function parseUuidArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/** Назначить со-администратора комнаты (не хоста; хост / staff — RLS). */
export async function addSpaceRoomAdminUser(slug: string, targetUserId: string): Promise<boolean> {
  const trimmed = slug.trim()
  const tid = targetUserId.trim()
  if (!trimmed || !tid) return false
  const sel = await dbTableSelectOne<{ host_user_id: unknown; room_admin_user_ids: unknown }>({
    table: 'space_rooms',
    select: 'host_user_id,room_admin_user_ids',
    filters: { slug: trimmed },
  })
  if (!sel.ok || !sel.data.row) {
    if (!sel.ok) console.warn('addSpaceRoomAdminUser:', sel.error.message)
    return false
  }
  const row = sel.data.row as any
  const hostId = typeof row.host_user_id === 'string' ? row.host_user_id : null
  if (hostId && tid === hostId) return false
  const current = parseUuidArray(row.room_admin_user_ids)
  if (current.includes(tid)) return true
  const upd = await dbTableUpdate({
    table: 'space_rooms',
    patch: { room_admin_user_ids: [...current, tid], updated_at: new Date().toISOString() },
    filters: { slug: trimmed },
  })
  if (!upd.ok) {
    console.warn('addSpaceRoomAdminUser:', upd.error.message)
    return false
  }
  return true
}

/** Снять со-администратора комнаты. */
export async function removeSpaceRoomAdminUser(slug: string, targetUserId: string): Promise<boolean> {
  const trimmed = slug.trim()
  const tid = targetUserId.trim()
  if (!trimmed || !tid) return false
  const sel = await dbTableSelectOne<{ room_admin_user_ids: unknown }>({
    table: 'space_rooms',
    select: 'room_admin_user_ids',
    filters: { slug: trimmed },
  })
  if (!sel.ok || !sel.data.row) {
    if (!sel.ok) console.warn('removeSpaceRoomAdminUser:', sel.error.message)
    return false
  }
  const current = parseUuidArray((sel.data.row as any).room_admin_user_ids)
  const next = current.filter((id) => id !== tid)
  if (next.length === current.length) return true
  const upd = await dbTableUpdate({
    table: 'space_rooms',
    patch: { room_admin_user_ids: next, updated_at: new Date().toISOString() },
    filters: { slug: trimmed },
  })
  if (!upd.ok) {
    console.warn('removeSpaceRoomAdminUser:', upd.error.message)
    return false
  }
  return true
}
