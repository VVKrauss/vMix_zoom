import { fetchJson } from './http'

export async function v1SetConversationNotificationsMuted(
  conversationId: string,
  muted: boolean,
): Promise<{ ok: boolean; muted?: boolean; error?: string }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/me/conversations/${encodeURIComponent(cid)}/notifications-muted`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ muted }),
  })
  if (!r.ok) return { ok: false, error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { ok: false, error: typeof data?.error === 'string' ? data.error : 'request_failed' }
  return { ok: true, muted: data.muted === true }
}

