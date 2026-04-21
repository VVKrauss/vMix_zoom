import { supabase } from './supabase'

export type ConversationMentionPick = {
  userId: string
  displayName: string
  profileSlug: string
  avatarUrl: string | null
}

export async function listConversationMembersForMentions(
  conversationId: string,
): Promise<{ data: ConversationMentionPick[] | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'Нет чата' }
  const { data, error } = await supabase.rpc('list_conversation_members_for_mentions', {
    p_conversation_id: cid,
  })
  if (error) return { data: null, error: error.message }
  const rows = Array.isArray(data) ? data : []
  const out: ConversationMentionPick[] = rows
    .map((r) => {
      const row = r as Record<string, unknown>
      const userId = typeof row.user_id === 'string' ? row.user_id.trim() : ''
      const displayName =
        typeof row.display_name === 'string' && row.display_name.trim() ? row.display_name.trim() : 'Пользователь'
      const profileSlug = typeof row.profile_slug === 'string' ? row.profile_slug.trim() : ''
      if (!userId || !profileSlug) return null
      const avatarUrl =
        typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null
      return { userId, displayName, profileSlug, avatarUrl }
    })
    .filter(Boolean) as ConversationMentionPick[]
  return { data: out, error: null }
}

export async function markMyMentionsRead(
  conversationId: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Нет чата' }
  const { error } = await supabase.rpc('mark_my_mentions_read', { p_conversation_id: cid })
  return { error: error?.message ?? null }
}

