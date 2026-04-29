import { fetchJson } from './http'

export async function v1HasPendingConversationJoinRequest(conversationId: string): Promise<{ data: boolean | null; error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ pending: boolean }>(`/api/v1/me/conversation-join-requests/${encodeURIComponent(cid)}/pending`, {
    method: 'GET',
    auth: true,
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.pending === true, error: null }
}

export async function v1RequestConversationJoin(conversationId: string): Promise<{ data: any | null; error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/me/conversation-join-requests`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ conversationId: cid }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1ListConversationJoinRequests(conversationId: string): Promise<{ data: any[] | null; error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ rows: any[] }>(`/api/v1/conversations/${encodeURIComponent(cid)}/join-requests`, {
    method: 'GET',
    auth: true,
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : [], error: null }
}

export async function v1ApproveConversationJoinRequest(requestId: string): Promise<{ error: string | null }> {
  const rid = requestId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/conversation-join-requests/approve`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ requestId: rid }),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_approved' }
  return { error: null }
}

export async function v1DenyConversationJoinRequest(requestId: string): Promise<{ error: string | null }> {
  const rid = requestId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/conversation-join-requests/deny`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ requestId: rid }),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_denied' }
  return { error: null }
}

export async function v1ListConversationMembersForManagement(conversationId: string): Promise<{ data: any[] | null; error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ rows: any[] }>(`/api/v1/conversations/${encodeURIComponent(cid)}/members/management`, {
    method: 'GET',
    auth: true,
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : [], error: null }
}

export async function v1RemoveConversationMemberByStaff(conversationId: string, targetUserId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const tid = targetUserId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/conversations/${encodeURIComponent(cid)}/members/kick`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetUserId: tid }),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_removed' }
  return { error: null }
}

export async function v1ListConversationStaffMembers(conversationId: string): Promise<{ data: any[] | null; error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ rows: any[] }>(`/api/v1/conversations/${encodeURIComponent(cid)}/staff`, {
    method: 'GET',
    auth: true,
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : [], error: null }
}

export async function v1SetConversationMemberStaffRole(conversationId: string, targetUserId: string, newRole: 'member'|'moderator'|'admin'): Promise<{ error: string | null; code: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/conversations/${encodeURIComponent(cid)}/staff/role`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetUserId: targetUserId.trim(), newRole }),
  })
  if (!r.ok) return { error: r.error.message, code: null }
  const data = (r.data as any)?.data
  if (data?.ok !== true) {
    const code = typeof data?.error === 'string' ? data.error : 'unknown'
    return { error: code, code }
  }
  return { error: null, code: null }
}

