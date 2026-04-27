import { fetchJson } from './http'

export async function v1ListConversationMembersForMentions(conversationId: string): Promise<{ data: any[] | null; error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ rows: any[] }>(`/api/v1/conversations/${encodeURIComponent(cid)}/mention-picks`, { method: 'GET', auth: true })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : [], error: null }
}

export async function v1MarkMyMentionsRead(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ ok: true }>(`/api/v1/conversations/${encodeURIComponent(cid)}/mentions/read`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

