import { fetchJson } from './http'

export async function v1CreateGroupChat(title: string, isPublic: boolean): Promise<{ data: string | null; error: string | null }> {
  const r = await fetchJson<{ conversationId: string }>('/api/v1/groups', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ title, isPublic }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const id = typeof (r.data as any)?.conversationId === 'string' ? (r.data as any).conversationId : null
  return { data: id, error: null }
}

export async function v1JoinPublicGroupChat(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/groups/${encodeURIComponent(cid)}/join`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_joined' }
  return { error: null }
}

export async function v1LeaveGroupChat(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/groups/${encodeURIComponent(cid)}/leave`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_left' }
  return { error: null }
}

export async function v1AddUsersToGroupChat(conversationId: string, userIds: string[]): Promise<{ error: string | null; added: number }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/groups/${encodeURIComponent(cid)}/add-users`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ userIds }),
  })
  if (!r.ok) return { error: r.error.message, added: 0 }
  const data = (r.data as any)?.data
  const added = typeof data?.added === 'number' ? data.added : Number(data?.added ?? 0) || 0
  return { error: data?.ok === false ? (typeof data?.error === 'string' ? data.error : 'forbidden') : null, added }
}

export async function v1UpdateGroupProfile(conversationId: string, patch: any): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/groups/${encodeURIComponent(cid)}/profile`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(patch ?? {}),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_updated' }
  return { error: null }
}

export async function v1ResolveConversationByInvite(token: string): Promise<{ data: any[] | null; error: string | null }> {
  const t = token.trim()
  const r = await fetchJson<{ rows: any[] }>(`/api/v1/invites/${encodeURIComponent(t)}/preview`, { method: 'GET', auth: true })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : [], error: null }
}

export async function v1JoinConversationByInvite(token: string): Promise<{ data: any | null; error: string | null }> {
  const t = token.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/invites/${encodeURIComponent(t)}/join`, { method: 'POST', auth: true, body: JSON.stringify({}) })
  if (!r.ok) return { data: null, error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { data: null, error: typeof data?.error === 'string' ? data.error : 'not_joined' }
  return { data, error: null }
}

export async function v1GetOrCreateConversationInvite(conversationId: string): Promise<{ data: { token: string } | null; error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/conversations/${encodeURIComponent(cid)}/invite`, { method: 'POST', auth: true, body: JSON.stringify({}) })
  if (!r.ok) return { data: null, error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { data: null, error: typeof data?.error === 'string' ? data.error : 'not_created' }
  const token = typeof data?.token === 'string' ? data.token.trim() : ''
  return token ? { data: { token }, error: null } : { data: null, error: 'not_created' }
}

