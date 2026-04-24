import { apiFetch } from './backend/client'

export type ConversationMentionPick = {
  userId: string
  displayName: string
  avatarUrl: string | null
}

export async function listConversationMembersForMentions(
  conversationId: string,
): Promise<{ data: ConversationMentionPick[] | null; error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { data: null, error: 'Нет чата' }
  const res = await apiFetch<{ items: { userId: string; displayName: string; avatarUrl: string | null }[] }>(
    `/dm/${encodeURIComponent(cid)}/members`,
  )
  if (res.error || !res.data) return { data: null, error: res.error ?? 'request_failed' }
  const out: ConversationMentionPick[] = (res.data.items ?? [])
    .map((row) => ({
      userId: String(row.userId ?? '').trim(),
      displayName: String(row.displayName ?? '').trim() || 'Пользователь',
      avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
    }))
    .filter((x) => Boolean(x.userId))
  return { data: out, error: null }
}

export async function markMyMentionsRead(
  conversationId: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Нет чата' }
  // Пока не реализовано на backend
  return { error: null }
}

