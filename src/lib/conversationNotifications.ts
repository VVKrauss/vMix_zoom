export async function setConversationNotificationsMuted(
  conversationId: string,
  muted: boolean,
): Promise<{ ok: boolean; muted?: boolean; error?: string }> {
  void conversationId
  void muted
  return { ok: false, error: 'not_migrated' }
}

export async function getMyConversationNotificationMutes(
  conversationIds: string[],
): Promise<{ data: Record<string, boolean> | null; error: string | null }> {
  void conversationIds
  return { data: {}, error: 'not_migrated' }
}

