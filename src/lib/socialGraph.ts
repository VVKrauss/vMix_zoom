import { supabase } from './supabase'

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

export async function listMyContactAliases(
  contactUserIds: string[],
): Promise<{ data: Record<string, string> | null; error: string | null }> {
  const ids = Array.from(new Set(contactUserIds.map((x) => x.trim()).filter(Boolean)))
  if (ids.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase.rpc('list_my_contact_aliases', {
    p_contact_user_ids: ids,
  })
  if (error) return { data: null, error: error.message }
  const out: Record<string, string> = {}
  for (const row of Array.isArray(data) ? data : []) {
    const r = row as Record<string, unknown>
    const uid = typeof r.contact_user_id === 'string' ? r.contact_user_id.trim() : String(r.contact_user_id ?? '').trim()
    const alias = typeof r.alias === 'string' ? r.alias.trim() : String(r.alias ?? '').trim()
    if (uid && alias) out[uid] = alias
  }
  return { data: out, error: null }
}

export async function setMyContactAlias(
  contactUserId: string,
  alias: string,
): Promise<{ data: string | null; error: string | null }> {
  const id = contactUserId.trim()
  if (!id) return { data: null, error: 'Не выбран пользователь' }
  const { data, error } = await supabase.rpc('set_my_contact_alias', {
    p_contact_user_id: id,
    p_alias: alias,
  })
  if (error) return { data: null, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { data: null, error: typeof row?.error === 'string' ? row.error : 'request_failed' }
  const a = typeof row.alias === 'string' && row.alias.trim() ? row.alias.trim() : null
  return { data: a, error: null }
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
  const { data, error } = await supabase.rpc('list_my_contacts')
  if (error) return { data: null, error: error.message }
  return {
    data: Array.isArray(data) ? data.map((row) => mapContactCardRow(row as Record<string, unknown>)) : [],
    error: null,
  }
}

export async function getContactStatuses(
  targetUserIds: string[],
): Promise<{ data: Record<string, ContactStatus> | null; error: string | null }> {
  const ids = Array.from(
    new Set(
      targetUserIds
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  )
  if (ids.length === 0) return { data: {}, error: null }

  const { data, error } = await supabase.rpc('get_contact_statuses', {
    p_target_user_ids: ids,
  })
  if (error) return { data: null, error: error.message }

  const mapped: Record<string, ContactStatus> = {}
  for (const row of Array.isArray(data) ? data : []) {
    const item = mapContactStatusRow(row as Record<string, unknown>)
    mapped[item.targetUserId] = item
  }
  return { data: mapped, error: null }
}

/** Добавить или убрать из контактов (user_favorites, RPC set_user_favorite). */
export async function setContactPin(
  targetUserId: string,
  pinned: boolean,
): Promise<{ data: ContactStatus | null; error: string | null }> {
  const trimmed = targetUserId.trim()
  if (!trimmed) return { data: null, error: 'Не выбран пользователь' }
  const { data, error } = await supabase.rpc('set_user_favorite', {
    p_target_user_id: trimmed,
    p_favorite: pinned,
  })
  if (error) return { data: null, error: error.message }
  if (!data || typeof data !== 'object') return { data: null, error: 'Пустой ответ сервера' }
  return { data: mapContactStatusRow(data as Record<string, unknown>), error: null }
}

export async function hideContactFromMyList(
  hiddenUserId: string,
): Promise<{ error: string | null }> {
  const id = hiddenUserId.trim()
  if (!id) return { error: 'Не указан пользователь' }
  const { data, error } = await supabase.rpc('hide_contact_from_my_list', {
    p_hidden_user_id: id,
  })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    return { error: typeof row?.error === 'string' ? row.error : 'request_failed' }
  }
  return { error: null }
}

export async function setUserBlocked(
  targetUserId: string,
  blocked: boolean,
): Promise<{ data: Pick<ContactStatus, 'targetUserId' | 'blockedByMe' | 'blockedMe'> | null; error: string | null }> {
  const trimmed = targetUserId.trim()
  if (!trimmed) return { data: null, error: 'Не выбран пользователь' }
  const { data, error } = await supabase.rpc('set_user_block', {
    p_target_user_id: trimmed,
    p_block: blocked,
  })
  if (error) return { data: null, error: error.message }
  if (!data || typeof data !== 'object') return { data: null, error: 'Пустой ответ сервера' }
  const row = data as Record<string, unknown>
  return {
    data: {
      targetUserId: String(row.target_user_id ?? trimmed),
      blockedByMe: row.blocked_by_me === true,
      blockedMe: row.blocked_me === true,
    },
    error: null,
  }
}

export async function searchRegisteredUsers(
  query: string,
  limit = 20,
): Promise<{ data: RegisteredUserSearchHit[] | null; error: string | null }> {
  let q = query.trim()
  while (q.startsWith('@')) q = q.slice(1).trim()
  if (q.length < 2) return { data: [], error: null }
  const { data, error } = await supabase.rpc('search_registered_users', {
    p_query: q,
    p_limit: limit,
  })
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? data : []
  const mapped: RegisteredUserSearchHit[] = rows.map((row) => {
    const r = row as Record<string, unknown>
    return {
      id: String(r.id ?? ''),
      displayName:
        typeof r.display_name === 'string' && r.display_name.trim()
          ? r.display_name.trim()
          : 'Пользователь',
      profileSlug:
        typeof r.profile_slug === 'string' && r.profile_slug.trim() ? r.profile_slug.trim() : null,
      avatarUrl:
        typeof r.avatar_url === 'string' && r.avatar_url.trim() ? r.avatar_url.trim() : null,
    }
  })
  return { data: mapped.filter((x) => x.id.length > 0), error: null }
}
