import { v1SetConversationNotificationsMuted } from '../api/conversationNotificationsApi'
import { v1GetMyConversationNotificationMutes } from '../api/meApi'

export async function setConversationNotificationsMuted(
  conversationId: string,
  muted: boolean,
): Promise<{ ok: boolean; muted?: boolean; error?: string }> {
  return await v1SetConversationNotificationsMuted(conversationId, muted)
}

export async function getMyConversationNotificationMutes(
  conversationIds: string[],
): Promise<{ data: Record<string, boolean> | null; error: string | null }> {
  return await v1GetMyConversationNotificationMutes(conversationIds)
}

