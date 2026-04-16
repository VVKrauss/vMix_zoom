import { supabase } from './supabase'

export type ConversationJoinRequest = {
  requestId: string
  userId: string
  displayName: string
  createdAt: string
}

export async function hasPendingConversationJoinRequest(
  conversationId: string,
): Promise<{ data: boolean | null; error: string | null }> {
  const { data, error } = await supabase.rpc('has_pending_conversation_join_request', {
    p_conversation_id: conversationId.trim(),
  })
  return { data: typeof data === 'boolean' ? data : null, error: error?.message ?? null }
}

export async function requestConversationJoin(
  conversationId: string,
): Promise<{ data: { requested?: boolean; already_member?: boolean; required_plan?: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('request_conversation_join', {
    p_conversation_id: conversationId.trim(),
  })
  if (error) return { data: null, error: error.message }
  return { data: data as { requested?: boolean; already_member?: boolean; required_plan?: string } | null, error: null }
}

export async function listConversationJoinRequests(
  conversationId: string,
): Promise<{ data: ConversationJoinRequest[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_conversation_join_requests', {
    p_conversation_id: conversationId.trim(),
  })
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? data : []
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
  const { data, error } = await supabase.rpc('approve_conversation_join_request', {
    p_request_id: requestId.trim(),
  })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { error: typeof row?.error === 'string' ? row.error : 'not_approved' }
  return { error: null }
}

export async function denyConversationJoinRequest(
  requestId: string,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('deny_conversation_join_request', {
    p_request_id: requestId.trim(),
  })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { error: typeof row?.error === 'string' ? row.error : 'not_denied' }
  return { error: null }
}
