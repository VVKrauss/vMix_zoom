import { supabase } from './supabase'

export type ConversationStaffMember = {
  user_id: string
  member_role: string
  display_name: string
}

export type ConversationStaffRole = 'member' | 'moderator' | 'admin'

export async function listConversationStaffMembers(
  conversationId: string,
): Promise<{ data: ConversationStaffMember[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_conversation_staff_members', {
    p_conversation_id: conversationId.trim(),
  })
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? data : []
  const out: ConversationStaffMember[] = rows
    .map((r) => {
      const row = r as Record<string, unknown>
      const user_id = typeof row.user_id === 'string' ? row.user_id : String(row.user_id ?? '')
      const member_role = typeof row.member_role === 'string' ? row.member_role : ''
      const display_name = typeof row.display_name === 'string' ? row.display_name : ''
      if (!user_id) return null
      return { user_id, member_role, display_name }
    })
    .filter(Boolean) as ConversationStaffMember[]
  return { data: out, error: null }
}

export async function setConversationMemberStaffRole(
  conversationId: string,
  targetUserId: string,
  newRole: ConversationStaffRole,
): Promise<{ error: string | null; code: string | null }> {
  const { data, error } = await supabase.rpc('set_conversation_member_staff_role', {
    p_conversation_id: conversationId.trim(),
    p_target_user_id: targetUserId.trim(),
    p_new_role: newRole,
  })
  if (error) return { error: error.message, code: null }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    const code = typeof row?.error === 'string' ? row.error : 'unknown'
    return { error: staffRoleErrorMessage(code), code }
  }
  return { error: null, code: null }
}

function staffRoleErrorMessage(code: string): string {
  switch (code) {
    case 'forbidden':
      return 'Недостаточно прав.'
    case 'only_owner_promotes_admin':
      return 'Только владелец может назначать администраторов.'
    case 'cannot_change_other_admin':
      return 'Администратор не может менять роль другого администратора.'
    case 'cannot_change_self':
      return 'Нельзя изменить свою роль здесь.'
    case 'cannot_change_owner':
      return 'Роль владельца нельзя изменить.'
    case 'target_not_member':
      return 'Пользователь не в списке участников.'
    case 'invalid_role':
      return 'Некорректная роль.'
    default:
      return 'Не удалось обновить роль.'
  }
}
