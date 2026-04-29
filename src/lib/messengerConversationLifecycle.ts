import { leaveChannel } from './channels'
import { leaveGroupChat } from './groups'
import { fetchJson } from '../api/http'

export async function leaveDirectConversationClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  const r = await fetchJson<{ ok: boolean; error?: string }>(`/api/v1/me/conversations/${encodeURIComponent(cid)}/leave-direct`, {
    method: 'POST',
    auth: true,
    body: '{}',
  })
  if (!r.ok) return { error: r.error.message }
  return r.data.ok === true ? { error: null } : { error: r.data.error ?? 'Не удалось удалить чат у себя' }
}

export async function deleteDirectConversationForAllClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  const r = await fetchJson<{ ok: boolean; error?: string }>(`/api/v1/me/conversations/${encodeURIComponent(cid)}/delete-direct-for-all`, {
    method: 'POST',
    auth: true,
    body: '{}',
  })
  if (!r.ok) return { error: r.error.message }
  return r.data.ok === true ? { error: null } : { error: r.data.error ?? 'Не удалось удалить переписку' }
}

export async function deleteOwnedGroupOrChannelClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  const r = await fetchJson<{ ok: boolean; error?: string }>(`/api/v1/me/conversations/${encodeURIComponent(cid)}/delete-owned`, {
    method: 'POST',
    auth: true,
    body: '{}',
  })
  if (!r.ok) return { error: r.error.message }
  return r.data.ok === true ? { error: null } : { error: r.data.error ?? 'Не удалось удалить чат' }
}

export async function leaveGroupOrChannelClient(
  kind: 'group' | 'channel',
  conversationId: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  return kind === 'group' ? leaveGroupChat(cid) : leaveChannel(cid)
}
