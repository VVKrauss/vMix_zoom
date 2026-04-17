import { supabase } from './supabase'

export async function setConversationNotificationsMuted(
  conversationId: string,
  muted: boolean,
): Promise<{ ok: boolean; muted?: boolean; error?: string }> {
  const cid = conversationId.trim()
  if (!cid) return { ok: false, error: 'conversation_required' }
  const { data, error } = await supabase.rpc('set_conversation_notifications_muted', {
    p_conversation_id: cid,
    p_muted: muted,
  })
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    return { ok: false, error: typeof row?.error === 'string' ? row.error : 'request_failed' }
  }
  return { ok: true, muted: row.muted === true }
}

export async function getMyConversationNotificationMutes(
  conversationIds: string[],
): Promise<{ data: Record<string, boolean> | null; error: string | null }> {
  const ids = Array.from(new Set(conversationIds.map((x) => x.trim()).filter(Boolean)))
  if (ids.length === 0) return { data: {}, error: null }
  const { data, error } = await supabase.rpc('get_my_conversation_notification_mutes', {
    p_conversation_ids: ids,
  })
  if (error) return { data: null, error: error.message }
  const out: Record<string, boolean> = {}
  for (const row of Array.isArray(data) ? data : []) {
    const r = row as Record<string, unknown>
    const cid = typeof r.conversation_id === 'string' ? r.conversation_id.trim() : ''
    if (!cid) continue
    out[cid] = r.muted === true
  }
  return { data: out, error: null }
}

