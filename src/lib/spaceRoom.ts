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
  // Space rooms are still Supabase-based; temporarily disabled during migration.
  void slug
  void authUserId
  return { joinable: false, denial: 'closed_or_missing', isDbHost: false }
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
  void userId
  return { data: [], error: 'not_migrated' }
}

export async function registerSpaceRoomAsHost(
  slug: string,
  userId: string,
  createOptions?: SpaceRoomCreateOptions | null,
): Promise<boolean> {
  void slug
  void userId
  void createOptions
  return false
}

export async function updateSpaceRoomChatVisibility(
  slug: string,
  _actorUserId: string,
  visibility: SpaceRoomChatVisibility,
): Promise<boolean> {
  void slug
  void visibility
  return false
}

export async function hostLeaveSpaceRoom(slug: string): Promise<void> {
  void slug
}

/** Заблокировать пользователя в комнате (хост / staff / со-админ комнаты — RLS). Read-modify-write. */
export async function banUserFromSpaceRoom(
  slug: string,
  _actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  void slug
  void targetUserId
  return false
}

/** Одобрить вход пользователя (режим approval; хост / staff / со-админ — RLS). */
export async function approveSpaceRoomJoiner(
  slug: string,
  _actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  void slug
  void targetUserId
  return false
}

/** Убрать пользователя из списка ожидающих (отклонить или очистить после входа). */
export async function removeSpaceRoomApprovedJoiner(
  slug: string,
  _actorUserId: string,
  targetUserId: string,
): Promise<void> {
  void slug
  void targetUserId
}

/** Режим входа в комнату (хост / staff / со-админ — RLS). */
export async function updateSpaceRoomAccessMode(
  slug: string,
  _actorUserId: string,
  mode: 'link' | 'approval' | 'invite_only',
): Promise<boolean> {
  void slug
  void mode
  return false
}

function parseUuidArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

/** Назначить со-администратора комнаты (не хоста; хост / staff — RLS). */
export async function addSpaceRoomAdminUser(slug: string, targetUserId: string): Promise<boolean> {
  void slug
  void targetUserId
  return false
}

/** Снять со-администратора комнаты. */
export async function removeSpaceRoomAdminUser(slug: string, targetUserId: string): Promise<boolean> {
  void slug
  void targetUserId
  return false
}
