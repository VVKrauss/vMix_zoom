import { listMyRoomChatConversations } from '../api/roomChatApi'
import { listConversationMembersBasic } from '../api/conversationMembersApi'
import { fetchJson } from '../api/http'
import { v1ListConversationMessagesPage } from '../api/messengerApi'

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

  // userId оставлен в сигнатуре для совместимости (функция используется UI-кодом как раньше),
  // но в новой архитектуре список определяется по auth-сессии.
  void userId
  const r = await listMyRoomChatConversations({ limit, offset })
  if (!r.ok) return { data: null, error: r.error.message, hasMore: false }
  const rows = (r.data.rows ?? []).map((row: any) => mapConversationRow(row as Record<string, unknown>))
  return {
    data: rows,
    error: null,
    hasMore: r.data.hasMore === true,
  }
}

/** Убрать комнату из своего списка; при отсутствии сообщений диалог удаляется из БД для всех. */
export async function leaveRoomChatArchiveEntry(
  conversationId: string,
): Promise<{ ok: boolean; removedConversation: boolean; error: string | null }> {
  const id = conversationId.trim()
  if (!id) return { ok: false, removedConversation: false, error: 'Нет id' }

  const r = await fetchJson<{ ok: boolean; removedConversation?: boolean; error?: string }>(
    `/api/v1/me/room-chat-conversations/${encodeURIComponent(id)}/leave`,
    { method: 'POST', auth: true, body: '{}' },
  )
  if (!r.ok) return { ok: false, removedConversation: false, error: r.error.message }
  if (r.data.ok !== true) return { ok: false, removedConversation: false, error: r.data.error ?? 'request_failed' }
  return { ok: true, removedConversation: r.data.removedConversation === true, error: null }
}

/** Админ: удалить room-чаты без сообщений или без участников. */
export async function adminPurgeStaleRoomChats(): Promise<{ deleted: number; error: string | null }> {
  const r = await fetchJson<{ ok: boolean; deleted?: number }>(`/api/v1/admin/room-chats/purge-stale`, {
    method: 'POST',
    auth: true,
    body: '{}',
  })
  if (!r.ok) return { deleted: 0, error: r.error.message }
  const n = typeof r.data.deleted === 'number' ? r.data.deleted : Number(r.data.deleted ?? 0) || 0
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

  const r = await listConversationMembersBasic(conversationId)
  if (!r.ok) return { data: null, error: r.error.message }
  const users = r.data.rows ?? []
  const byId = new Map<string, { display_name: string | null; avatar_url: string | null }>()
  for (const row of users ?? []) {
    const id = typeof (row as any).user_id === 'string' ? String((row as any).user_id) : ''
    if (!id) continue
    byId.set(id, {
      display_name: typeof (row as any).display_name === 'string' ? String((row as any).display_name) : null,
      avatar_url: typeof (row as any).avatar_url === 'string' ? String((row as any).avatar_url) : null,
    })
  }

  const ids = Array.from(byId.keys())
  if (ids.length === 0) return { data: [], error: null }
  const mapped: RoomChatMemberRow[] = ids.map((sid) => {
    const u = byId.get(sid)
    const dn = u?.display_name?.trim()
    return {
      userId: sid,
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
  void userId
  const id = conversationId.trim()
  if (!id) return { data: null, error: 'Нет id' }
  const r = await fetchJson<{ row: any | null }>(`/api/v1/me/room-chat-conversations/${encodeURIComponent(id)}`, {
    method: 'GET',
    auth: true,
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const row = r.data.row
  if (!row) return { data: null, error: null }
  if (row.kind !== 'room') return { data: null, error: 'Чат не найден' }
  return { data: mapConversationRow(row as Record<string, unknown>), error: null }
}

export async function listRoomChatMessagesForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: RoomChatArchiveMessage[] | null; error: string | null }> {
  const convo = await getRoomChatConversationForUser(conversationId, userId)
  if (convo.error) return { data: null, error: convo.error }
  if (!convo.data) return { data: null, error: 'Чат не найден' }

  const r = await v1ListConversationMessagesPage({ conversationId, limit: 1000, before: null })
  if (r.error || !r.data) return { data: null, error: r.error ?? 'request_failed' }
  const data = r.data.messages ?? []
  return {
    data: (data ?? []).map((row: any) => ({
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
