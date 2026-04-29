import {
  v1ApproveConversationJoinRequest,
  v1DenyConversationJoinRequest,
  v1HasPendingConversationJoinRequest,
  v1ListConversationJoinRequests,
  v1RequestConversationJoin,
} from '../api/conversationAdminApi'

export type ConversationJoinRequest = {
  requestId: string
  userId: string
  displayName: string
  createdAt: string
}

export async function hasPendingConversationJoinRequest(
  conversationId: string,
): Promise<{ data: boolean | null; error: string | null }> {
  return await v1HasPendingConversationJoinRequest(conversationId)
}

export async function requestConversationJoin(
  conversationId: string,
): Promise<{ data: { requested?: boolean; already_member?: boolean; required_plan?: string } | null; error: string | null }> {
  const r = await v1RequestConversationJoin(conversationId)
  if (r.error) return { data: null, error: r.error }
  return { data: r.data as any, error: null }
}

export async function listConversationJoinRequests(
  conversationId: string,
): Promise<{ data: ConversationJoinRequest[] | null; error: string | null }> {
  const r = await v1ListConversationJoinRequests(conversationId)
  if (r.error) return { data: null, error: r.error }
  const rows = Array.isArray(r.data) ? r.data : []
  return {
    data: rows
      .map((row) => {
        const r = row as Record<string, unknown>
        const requestId = typeof r.request_id === 'string' ? r.request_id : ''
        const userId = typeof r.user_id === 'string' ? r.user_id : ''
        const displayName = typeof r.display_name === 'string' ? r.display_name : 'Пользователь'
        const createdAt = typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString()
        return { requestId, userId, displayName, createdAt }
      })
      .filter((r) => r.requestId),
    error: null,
  }
}

export async function approveConversationJoinRequest(
  requestId: string,
): Promise<{ error: string | null }> {
  return await v1ApproveConversationJoinRequest(requestId)
}

export async function denyConversationJoinRequest(
  requestId: string,
): Promise<{ error: string | null }> {
  return await v1DenyConversationJoinRequest(requestId)
}
