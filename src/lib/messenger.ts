import { supabase } from './supabase'

export type DirectConversationSummary = {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
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
  }
}

export async function ensureSelfDirectConversation(): Promise<{ data: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_self_direct_conversation')
  if (error) return { data: null, error: error.message }
  return { data: typeof data === 'string' ? data : null, error: null }
}

export async function listDirectConversationsForUser(
  userId: string,
): Promise<{ data: DirectConversationSummary[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(
      'id, kind, title, created_at, last_message_at, last_message_preview, message_count, chat_conversation_members!inner(user_id)',
    )
    .eq('chat_conversation_members.user_id', userId)
    .eq('kind', 'direct')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((row) => mapDirectConversationRow(row as Record<string, unknown>)),
    error: null,
  }
}

export async function getDirectConversationForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: DirectConversationSummary | null; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(
      'id, kind, title, created_at, last_message_at, last_message_preview, message_count, chat_conversation_members!inner(user_id)',
    )
    .eq('chat_conversation_members.user_id', userId)
    .eq('id', conversationId)
    .eq('kind', 'direct')
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  return { data: mapDirectConversationRow(data as Record<string, unknown>), error: null }
}

export async function listDirectMessagesForUser(
  conversationId: string,
  userId: string,
): Promise<{ data: DirectMessage[] | null; error: string | null }> {
  const convo = await getDirectConversationForUser(conversationId, userId)
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
