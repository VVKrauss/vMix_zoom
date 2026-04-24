export const ROOM_CHAT_PAGE_SIZE = 10

export type RoomChatConversationSummary = {
  id: string
  title: string
  roomSlug: string | null
  createdAt: string
  closedAt: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
}

export type RoomChatArchiveMessage = {
  id: string
  senderUserId: string | null
  senderNameSnapshot: string
  kind: 'text' | 'system' | 'reaction'
  body: string
  createdAt: string
}

export type RoomChatLastSender = {
  conversationId: string
  senderUserId: string | null
  senderNameSnapshot: string
  avatarUrl: string | null
  createdAt: string
}

export type RoomChatMemberRow = {
  userId: string
  displayName: string
  avatarUrl: string | null
}

function mapConversationRow(row: Record<string, unknown>): RoomChatConversationSummary {
  return {
    id: String(row.id),
    title:
      (typeof row.title === 'string' && row.title.trim()) ||
      (typeof row.space_room_slug === 'string' && row.space_room_slug.trim()
        ? `Комната ${row.space_room_slug.trim()}`
        : 'Чат комнаты'),
    roomSlug: typeof row.space_room_slug === 'string' ? row.space_room_slug : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    closedAt: typeof row.closed_at === 'string' ? row.closed_at : null,
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    lastMessagePreview: typeof row.last_message_preview === 'string' ? row.last_message_preview : null,
    messageCount: typeof row.message_count === 'number' ? row.message_count : Number(row.message_count ?? 0) || 0,
  }
}

export async function listRoomChatConversationsForUser(
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ data: RoomChatConversationSummary[] | null; error: string | null; hasMore: boolean }> {
  void userId
  void options
  return { data: [], error: 'not_migrated', hasMore: false }
}

/** Убрать комнату из своего списка; при отсутствии сообщений диалог удаляется из БД для всех. */
export async function leaveRoomChatArchiveEntry(
  conversationId: string,
): Promise<{ ok: boolean; removedConversation: boolean; error: string | null }> {
  void conversationId
  return { ok: false, removedConversation: false, error: 'not_migrated' }
}

/** Админ: удалить room-чаты без сообщений или без участников. */
export async function adminPurgeStaleRoomChats(): Promise<{ deleted: number; error: string | null }> {
  return { deleted: 0, error: 'not_migrated' }
}

/** Участники room-чата (имена из users), только если текущий пользователь состоит в беседе. */
export async function listRoomChatMembersForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: RoomChatMemberRow[] | null; error: string | null }> {
  void conversationId
  void userId
  return { data: [], error: 'not_migrated' }
}

export async function getRoomChatConversationForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: RoomChatConversationSummary | null; error: string | null }> {
  void conversationId
  void userId
  return { data: null, error: 'not_migrated' }
}

export async function listRoomChatMessagesForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: RoomChatArchiveMessage[] | null; error: string | null }> {
  void conversationId
  void userId
  return { data: [], error: 'not_migrated' }
}
