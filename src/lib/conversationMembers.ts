import {
  v1ListConversationMembersForManagement,
  v1RemoveConversationMemberByStaff,
} from '../api/conversationAdminApi'

export type ConversationMemberRow = {
  userId: string
  role: string
  displayName: string
}

export async function listConversationMembersForManagement(
  conversationId: string,
): Promise<{ data: ConversationMemberRow[] | null; error: string | null }> {
  const r = await v1ListConversationMembersForManagement(conversationId)
  if (r.error) return { data: null, error: r.error }
  const rows = Array.isArray(r.data) ? r.data : []
  const out: ConversationMemberRow[] = rows
    .map((r) => {
      const row = r as Record<string, unknown>
      const userId = typeof row.user_id === 'string' ? row.user_id : String(row.user_id ?? '')
      if (!userId) return null
      const role = typeof row.member_role === 'string' ? row.member_role : String(row.member_role ?? '')
      const displayName =
        typeof row.display_name === 'string' && row.display_name.trim() ? row.display_name.trim() : 'Пользователь'
      return { userId, role, displayName }
    })
    .filter(Boolean) as ConversationMemberRow[]
  return { data: out, error: null }
}

export async function removeConversationMemberByStaff(
  conversationId: string,
  targetUserId: string,
): Promise<{ error: string | null }> {
  return await v1RemoveConversationMemberByStaff(conversationId, targetUserId)
}

