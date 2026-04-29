import { fetchJson } from './http'

export type V1ContactAliasRow = {
  contact_user_id: string
  alias: string | null
  display_avatar_url: string | null
}

export type V1ContactStatusRow = {
  target_user_id: string
  is_favorite: boolean
  favors_me: boolean
  is_friend: boolean
  blocked_by_me?: boolean
  blocked_me?: boolean
}

export async function v1ListMyContacts(): Promise<{ data: unknown[] | null; error: string | null }> {
  const r = await fetchJson<{ contacts: unknown[] }>('/api/v1/me/contacts', { method: 'GET', auth: true })
  if (!r.ok) return { data: null, error: r.error.message }
  const contacts = Array.isArray(r.data?.contacts) ? r.data.contacts : []
  return { data: contacts, error: null }
}

export async function v1ListMyContactAliases(
  ids: string[],
): Promise<{ data: V1ContactAliasRow[] | null; error: string | null }> {
  const r = await fetchJson<{ rows: V1ContactAliasRow[] }>('/api/v1/me/contact-aliases', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ ids }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? ((r.data as any).rows as V1ContactAliasRow[]) : []
  return { data: rows, error: null }
}

export async function v1SetMyContactAlias(
  contactUserId: string,
  alias: string,
): Promise<{ data: unknown | null; error: string | null }> {
  const r = await fetchJson<{ data: unknown }>('/api/v1/me/contact-alias', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ contactUserId, alias }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1SetMyContactDisplayAvatar(
  contactUserId: string,
  displayAvatarUrl: string,
): Promise<{ data: unknown | null; error: string | null }> {
  const r = await fetchJson<{ data: unknown }>('/api/v1/me/contact-display-avatar', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ contactUserId, displayAvatarUrl }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1GetContactStatuses(
  targetUserIds: string[],
): Promise<{ data: V1ContactStatusRow[] | null; error: string | null }> {
  const r = await fetchJson<{ rows: V1ContactStatusRow[] }>('/api/v1/me/contact-statuses', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetUserIds }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? ((r.data as any).rows as V1ContactStatusRow[]) : []
  return { data: rows, error: null }
}

export async function v1SetContactPin(
  targetUserId: string,
  favorite: boolean,
): Promise<{ data: unknown | null; error: string | null }> {
  const r = await fetchJson<{ data: unknown }>('/api/v1/me/favorites', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetUserId, favorite }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1SetUserBlocked(
  targetUserId: string,
  block: boolean,
): Promise<{ data: unknown | null; error: string | null }> {
  const r = await fetchJson<{ data: unknown }>('/api/v1/me/blocks', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetUserId, block }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1HideContactFromMyList(hiddenUserId: string): Promise<{ data: unknown | null; error: string | null }> {
  const r = await fetchJson<{ data: unknown }>('/api/v1/me/contact-list-hides', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ hiddenUserId }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export type V1RegisteredUserSearchHit = {
  id: string
  display_name: string | null
  profile_slug: string | null
  avatar_url: string | null
}

export async function v1SearchRegisteredUsers(
  query: string,
  limit = 20,
): Promise<{ data: V1RegisteredUserSearchHit[] | null; error: string | null }> {
  const r = await fetchJson<{ rows: V1RegisteredUserSearchHit[] }>('/api/v1/users/search', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ query, limit }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? ((r.data as any).rows as V1RegisteredUserSearchHit[]) : []
  return { data: rows, error: null }
}

export async function v1GetMyConversationNotificationMutes(
  ids: string[],
): Promise<{ data: Record<string, boolean> | null; error: string | null }> {
  const uniq = Array.from(new Set(ids.map((x) => x.trim()).filter(Boolean))).slice(0, 500)
  if (!uniq.length) return { data: {}, error: null }
  const r = await fetchJson<{ rows: { conversation_id: string; muted: boolean }[] }>(
    '/api/v1/me/conversation-notification-mutes',
    {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ ids: uniq }),
    },
  )
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? ((r.data as any).rows as any[]) : []
  const out: Record<string, boolean> = {}
  for (const raw of rows) {
    const cid = typeof raw?.conversation_id === 'string' ? raw.conversation_id : ''
    if (!cid) continue
    out[cid] = raw?.muted === true
  }
  return { data: out, error: null }
}

