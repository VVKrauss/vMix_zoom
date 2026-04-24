/** Контакты (user_favorites): я добавил / меня добавили / взаимно. */
export type ContactStatus = {
  targetUserId: string
  pinnedByMe: boolean
  pinnedMe: boolean
  isMutualContact: boolean
  blockedByMe: boolean
  blockedMe: boolean
}

export type ContactCard = ContactStatus & {
  displayName: string
  profileSlug: string | null
  avatarUrl: string | null
  accountStatus: string
  linkedAt: string | null
}

export type RegisteredUserSearchHit = {
  id: string
  displayName: string
  profileSlug: string | null
  avatarUrl: string | null
}

export type MyContactDisplayOverride = {
  alias: string
  displayAvatarUrl: string | null
}

const NOT_MIGRATED = 'not_migrated'

export async function listMyContactDisplayOverrides(
  contactUserIds: string[],
): Promise<{ data: Record<string, MyContactDisplayOverride> | null; error: string | null }> {
  void contactUserIds
  return { data: {}, error: NOT_MIGRATED }
}

export async function listMyContactAliases(
  contactUserIds: string[],
): Promise<{ data: Record<string, string> | null; error: string | null }> {
  void contactUserIds
  return { data: {}, error: NOT_MIGRATED }
}

export async function setMyContactDisplayAvatar(
  contactUserId: string,
  displayAvatarUrl: string,
): Promise<{ data: string | null; error: string | null }> {
  void contactUserId
  void displayAvatarUrl
  return { data: null, error: NOT_MIGRATED }
}

export async function setMyContactAlias(
  contactUserId: string,
  alias: string,
): Promise<{ data: string | null; error: string | null }> {
  void contactUserId
  void alias
  return { data: null, error: NOT_MIGRATED }
}

function mapContactStatusRow(row: Record<string, unknown>): ContactStatus {
  const targetUserId = String(row.target_user_id ?? '')
  const pinnedByMe =
    row.is_favorite === true ||
    row.outbound_favorite === true
  const pinnedMe =
    row.favors_me === true ||
    row.inbound_favorite === true
  const isMutualContact =
    row.is_friend === true ||
    (pinnedByMe && pinnedMe)
  const blockedByMe = row.blocked_by_me === true
  const blockedMe = row.blocked_me === true
  return {
    targetUserId,
    pinnedByMe,
    pinnedMe,
    isMutualContact,
    blockedByMe,
    blockedMe,
  }
}

function mapContactCardRow(row: Record<string, unknown>): ContactCard {
  const slug =
    typeof row.profile_slug === 'string' && row.profile_slug.trim()
      ? row.profile_slug.trim()
      : null
  return {
    ...mapContactStatusRow(row),
    displayName:
      typeof row.display_name === 'string' && row.display_name.trim()
        ? row.display_name.trim()
        : 'Пользователь',
    profileSlug: slug,
    avatarUrl:
      typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null,
    accountStatus:
      typeof row.status === 'string' && row.status.trim()
        ? row.status.trim()
        : 'active',
    linkedAt:
      typeof row.favorited_at === 'string' && row.favorited_at.trim()
        ? row.favorited_at
        : null,
  }
}

export async function listMyContacts(): Promise<{ data: ContactCard[] | null; error: string | null }> {
  return { data: [], error: NOT_MIGRATED }
}

export async function getContactStatuses(
  targetUserIds: string[],
): Promise<{ data: Record<string, ContactStatus> | null; error: string | null }> {
  void targetUserIds
  return { data: {}, error: NOT_MIGRATED }
}

/** Добавить или убрать из контактов (user_favorites, RPC set_user_favorite). */
export async function setContactPin(
  targetUserId: string,
  pinned: boolean,
): Promise<{ data: ContactStatus | null; error: string | null }> {
  void targetUserId
  void pinned
  return { data: null, error: NOT_MIGRATED }
}

export async function hideContactFromMyList(
  hiddenUserId: string,
): Promise<{ error: string | null }> {
  void hiddenUserId
  return { error: NOT_MIGRATED }
}

export async function setUserBlocked(
  targetUserId: string,
  blocked: boolean,
): Promise<{ data: Pick<ContactStatus, 'targetUserId' | 'blockedByMe' | 'blockedMe'> | null; error: string | null }> {
  void targetUserId
  void blocked
  return { data: null, error: NOT_MIGRATED }
}

export async function searchRegisteredUsers(
  query: string,
  limit = 20,
): Promise<{ data: RegisteredUserSearchHit[] | null; error: string | null }> {
  void query
  void limit
  return { data: [], error: NOT_MIGRATED }
}
