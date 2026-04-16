import { supabase } from './supabase'

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
  const limit = Math.min(Math.max(options?.limit ?? ROOM_CHAT_PAGE_SIZE, 1), 100)
  const offset = Math.max(options?.offset ?? 0, 0)

  const { data, error } = await supabase
    .from('chat_conversations')
    .select(
      'id, kind, space_room_slug, title, created_at, closed_at, last_message_at, last_message_preview, message_count, chat_conversation_members!inner(user_id)',
    )
    .eq('chat_conversation_members.user_id', userId)
    .eq('kind', 'room')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return { data: null, error: error.message, hasMore: false }
  const rows = (data ?? []).map((row) => mapConversationRow(row as Record<string, unknown>))
  return {
    data: rows,
    error: null,
    hasMore: rows.length === limit,
  }
}

/** Убрать комнату из своего списка; при отсутствии сообщений диалог удаляется из БД для всех. */
export async function leaveRoomChatArchiveEntry(
  conversationId: string,
): Promise<{ ok: boolean; removedConversation: boolean; error: string | null }> {
  const id = conversationId.trim()
  if (!id) return { ok: false, removedConversation: false, error: 'Нет id' }

  const { data, error } = await supabase.rpc('leave_room_chat_archive_entry', {
    p_conversation_id: id,
  })

  if (error) return { ok: false, removedConversation: false, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    const err = typeof row?.error === 'string' ? row.error : 'request_failed'
    return { ok: false, removedConversation: false, error: err }
  }
  return {
    ok: true,
    removedConversation: row.removed_conversation === true,
    error: null,
  }
}

/** Админ: удалить room-чаты без сообщений или без участников. */
export async function adminPurgeStaleRoomChats(): Promise<{ deleted: number; error: string | null }> {
  const { data, error } = await supabase.rpc('admin_purge_stale_room_chats')
  if (error) return { deleted: 0, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    const err = typeof row?.error === 'string' ? row.error : 'request_failed'
    return { deleted: 0, error: err }
  }
  const n = typeof row.deleted === 'number' ? row.deleted : Number(row.deleted ?? 0) || 0
  return { deleted: n, error: null }
}

/** Участники room-чата (имена из users), только если текущий пользователь состоит в беседе. */
export async function listRoomChatMembersForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: RoomChatMemberRow[] | null; error: string | null }> {
  const convo = await getRoomChatConversationForUser(conversationId, userId)
  if (convo.error) return { data: null, error: convo.error }
  if (!convo.data) return { data: null, error: 'Чат не найден' }

  const { data: mems, error: mErr } = await supabase
    .from('chat_conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)

  if (mErr) return { data: null, error: mErr.message }
  const ids = Array.from(
    new Set(
      (mems ?? [])
        .map((row) => (typeof row.user_id === 'string' ? row.user_id.trim() : ''))
        .filter(Boolean),
    ),
  )
  if (ids.length === 0) return { data: [], error: null }

  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, display_name, avatar_url')
    .in('id', ids)

  if (uErr) return { data: null, error: uErr.message }

  const byId = new Map<string, { display_name: string | null; avatar_url: string | null }>()
  for (const row of users ?? []) {
    const id = typeof row.id === 'string' ? row.id : ''
    if (!id) continue
    byId.set(id, {
      display_name: typeof row.display_name === 'string' ? row.display_name : null,
      avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    })
  }

  const mapped: RoomChatMemberRow[] = ids.map((id) => {
    const u = byId.get(id)
    const dn = u?.display_name?.trim()
    return {
      userId: id,
      displayName: dn || 'Участник',
      avatarUrl: u?.avatar_url?.trim() ? u.avatar_url.trim() : null,
    }
  })
  mapped.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'))
  return { data: mapped, error: null }
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
