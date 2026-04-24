export type ConversationMemberRow = {
  userId: string
  role: string
  displayName: string
}

export async function listConversationMembersForManagement(
  conversationId: string,
): Promise<{ data: ConversationMemberRow[] | null; error: string | null }> {
  void conversationId
  return { data: [], error: 'not_migrated' }
}

export async function removeConversationMemberByStaff(
  conversationId: string,
  targetUserId: string,
): Promise<{ error: string | null }> {
  void conversationId
  void targetUserId
  return { error: 'not_migrated' }
}

