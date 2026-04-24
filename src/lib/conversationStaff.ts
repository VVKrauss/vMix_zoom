export type ConversationStaffMember = {
  user_id: string
  member_role: string
  display_name: string
}

export type ConversationStaffRole = 'member' | 'moderator' | 'admin'

export async function listConversationStaffMembers(
  conversationId: string,
): Promise<{ data: ConversationStaffMember[] | null; error: string | null }> {
  void conversationId
  return { data: [], error: 'not_migrated' }
}

export async function setConversationMemberStaffRole(
  conversationId: string,
  targetUserId: string,
  newRole: ConversationStaffRole,
): Promise<{ error: string | null; code: string | null }> {
  void conversationId
  void targetUserId
  void newRole
  return { error: 'not_migrated', code: 'not_migrated' }
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
