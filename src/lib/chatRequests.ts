export type ConversationJoinRequest = {
  requestId: string
  userId: string
  displayName: string
  createdAt: string
}

export async function hasPendingConversationJoinRequest(
  conversationId: string,
): Promise<{ data: boolean | null; error: string | null }> {
  void conversationId
  return { data: null, error: 'not_migrated' }
}

export async function requestConversationJoin(
  conversationId: string,
): Promise<{ data: { requested?: boolean; already_member?: boolean; required_plan?: string } | null; error: string | null }> {
  void conversationId
  return { data: null, error: 'not_migrated' }
}

export async function listConversationJoinRequests(
  conversationId: string,
): Promise<{ data: ConversationJoinRequest[] | null; error: string | null }> {
  void conversationId
  return { data: [], error: 'not_migrated' }
}

export async function approveConversationJoinRequest(
  requestId: string,
): Promise<{ error: string | null }> {
  void requestId
  return { error: 'not_migrated' }
}

export async function denyConversationJoinRequest(
  requestId: string,
): Promise<{ error: string | null }> {
  void requestId
  return { error: 'not_migrated' }
}
