import { fetchJson, type ApiResult } from './http'

export type ConversationMemberBasicRow = {
  user_id: string
  display_name: string | null
  avatar_url: string | null
}

export async function listConversationMembersBasic(
  conversationId: string,
): Promise<ApiResult<{ rows: ConversationMemberBasicRow[] }>> {
  const cid = String(conversationId ?? '').trim()
  if (!cid) return { ok: false, error: { status: 400, message: 'bad_conversation_id' } }
  return await fetchJson(`/api/v1/conversations/${encodeURIComponent(cid)}/members/basic`, { method: 'GET', auth: true })
}

