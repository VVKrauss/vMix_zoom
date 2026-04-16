import { supabase } from './supabase'

export type ConversationMemberRow = {
  userId: string
  role: string
  displayName: string
}

export async function listConversationMembersForManagement(
  conversationId: string,
): Promise<{ data: ConversationMemberRow[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_conversation_members_for_management', {
    p_conversation_id: conversationId.trim(),
  })
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? data : []
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

