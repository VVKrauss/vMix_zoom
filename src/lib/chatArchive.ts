import { supabase } from './supabase'

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
): Promise<{ data: RoomChatConversationSummary[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(
      'id, kind, space_room_slug, title, created_at, closed_at, last_message_at, last_message_preview, message_count, chat_conversation_members!inner(user_id)',
    )
    .eq('chat_conversation_members.user_id', userId)
    .eq('kind', 'room')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((row) => mapConversationRow(row as Record<string, unknown>)),
    error: null,
  }
}

export async function getRoomChatConversationForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: RoomChatConversationSummary | null; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(
      'id, kind, space_room_slug, title, created_at, closed_at, last_message_at, last_message_preview, message_count, chat_conversation_members!inner(user_id)',
    )
    .eq('chat_conversation_members.user_id', userId)
    .eq('id', conversationId)
    .eq('kind', 'room')
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  return { data: mapConversationRow(data as Record<string, unknown>), error: null }
}

export async function listRoomChatMessagesForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: RoomChatArchiveMessage[] | null; error: string | null }> {
  const convo = await getRoomChatConversationForUser(conversationId, userId)
  if (convo.error) return { data: null, error: convo.error }
  if (!convo.data) return { data: null, error: 'Чат не найден' }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, sender_user_id, sender_name_snapshot, kind, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((row) => ({
      id: String(row.id),
      senderUserId: typeof row.sender_user_id === 'string' ? row.sender_user_id : null,
      senderNameSnapshot:
        typeof row.sender_name_snapshot === 'string' && row.sender_name_snapshot.trim()
          ? row.sender_name_snapshot.trim()
          : 'Гость',
      kind:
        row.kind === 'reaction' || row.kind === 'system'
          ? row.kind
          : 'text',
      body: typeof row.body === 'string' ? row.body : '',
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    })),
    error: null,
  }
}
