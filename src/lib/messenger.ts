import { supabase } from './supabase'

export type DirectConversationSummary = {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
  unreadCount: number
  otherUserId: string | null
}

export type DirectMessage = {
  id: string
  senderUserId: string | null
  senderNameSnapshot: string
  kind: 'text' | 'system' | 'reaction'
  body: string
  createdAt: string
}

function mapDirectConversationRow(row: Record<string, unknown>): DirectConversationSummary {
  return {
    id: String(row.id),
    title:
      (typeof row.title === 'string' && row.title.trim()) ||
      'Сохраненное',
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    lastMessagePreview: typeof row.last_message_preview === 'string' ? row.last_message_preview : null,
    messageCount: typeof row.message_count === 'number' ? row.message_count : Number(row.message_count ?? 0) || 0,
    unreadCount: typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0,
    otherUserId: typeof row.other_user_id === 'string' ? row.other_user_id : null,
  }
}

export async function ensureSelfDirectConversation(): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_self_direct_conversation')
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function listDirectConversationsForUser(
): Promise<{ data: DirectConversationSummary[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_direct_conversations')
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((row: unknown) => mapDirectConversationRow(row as Record<string, unknown>)),
    error: null,
  }
}

export async function getDirectConversationForUser(
  conversationId: string,
): Promise<{ data: DirectConversationSummary | null; error: string | null }> {
  const list = await listDirectConversationsForUser()
  if (list.error) return { data: null, error: list.error }
  const item = (list.data ?? []).find((row) => row.id === conversationId) ?? null
  return { data: item, error: null }
}

export async function listDirectMessagesForUser(
  conversationId: string,
): Promise<{ data: DirectMessage[] | null; error: string | null }> {
  const convo = await getDirectConversationForUser(conversationId)
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
          : 'Вы',
      kind: row.kind === 'reaction' || row.kind === 'system' ? row.kind : 'text',
      body: typeof row.body === 'string' ? row.body : '',
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
    })),
    error: null,
  }
}

export async function ensureDirectConversationWithUser(
  targetUserId: string,
  targetTitle?: string | null,
): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_direct_conversation_with_user', {
    p_target_user_id: targetUserId,
    p_target_title: targetTitle ?? null,
  })
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function markDirectConversationRead(
  conversationId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_direct_conversation_read', {
    p_conversation_id: conversationId,
  })
  return { error: error?.message ?? null }
}

export async function getDirectUnreadCount(): Promise<{ data: number | null; error: string | null }> {
  const { data, error } = await supabase.rpc('list_my_direct_conversations')
  if (error) return { data: null, error: error.message }
  const count = Array.isArray(data)
    ? data.reduce((sum: number, row: Record<string, unknown>) => sum + (typeof row.unread_count === 'number' ? row.unread_count : Number(row.unread_count ?? 0) || 0), 0)
    : 0
  return { data: count, error: null }
}

export async function appendDirectMessage(
  conversationId: string,
  body: string,
): Promise<{ data: { createdAt: string | null } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('append_direct_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_kind: 'text',
  })

  if (error) return { data: null, error: error.message }
  return {
    data:
      data && typeof data === 'object'
        ? {
            createdAt:
              typeof (data as Record<string, unknown>).created_at === 'string'
                ? String((data as Record<string, unknown>).created_at)
                : null,
          }
        : { createdAt: null },
    error: null,
  }
}
