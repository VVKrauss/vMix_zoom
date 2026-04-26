import { v1ListConversationMembersForMentions, v1MarkMyMentionsRead } from '../api/mentionsApi'

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
  const r = await v1ListConversationMembersForMentions(cid)
  if (r.error) return { data: null, error: r.error }
  const rows = Array.isArray(r.data) ? r.data : []
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
  const r = await v1MarkMyMentionsRead(cid)
  return { error: r.error }
}

