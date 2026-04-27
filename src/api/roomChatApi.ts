import { fetchJson, type ApiResult } from './http'

export type RoomChatConversationRow = {
  id: string
  kind: 'room'
  space_room_slug: string | null
  title: string | null
  created_at: string
  closed_at: string | null
  last_message_at: string | null
  last_message_preview: string | null
  message_count: number
}

export async function listMyRoomChatConversations(params?: {
  limit?: number
  offset?: number
}): Promise<ApiResult<{ rows: RoomChatConversationRow[]; hasMore: boolean }>> {
  const limit = params?.limit
  const offset = params?.offset
  const qs = new URLSearchParams()
  if (typeof limit === 'number') qs.set('limit', String(limit))
  if (typeof offset === 'number') qs.set('offset', String(offset))
  const q = qs.toString()
  const path = `/api/v1/me/room-chat-conversations${q ? `?${q}` : ''}`
  return await fetchJson(path, { method: 'GET', auth: true })
}

