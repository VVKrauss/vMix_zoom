import { supabase } from './supabase'
import { leaveChannel } from './channels'
import { leaveGroupChat } from './groups'

function rpcOk(data: unknown): { ok: boolean; err: string | null } {
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    const e = typeof row?.error === 'string' ? row.error : 'request_failed'
    return { ok: false, err: e }
  }
  return { ok: true, err: null }
}

export async function leaveDirectConversationClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  const { data, error } = await supabase.rpc('leave_direct_conversation', { p_conversation_id: cid })
  if (error) return { error: error.message }
  const { ok, err } = rpcOk(data)
  return ok ? { error: null } : { error: err ?? 'Не удалось удалить чат у себя' }
}

export async function deleteDirectConversationForAllClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  const { data, error } = await supabase.rpc('delete_direct_conversation_for_all', { p_conversation_id: cid })
  if (error) return { error: error.message }
  const { ok, err } = rpcOk(data)
  return ok ? { error: null } : { error: err ?? 'Не удалось удалить переписку' }
}

export async function deleteOwnedGroupOrChannelClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  const { data, error } = await supabase.rpc('delete_owned_group_or_channel', { p_conversation_id: cid })
  if (error) return { error: error.message }
  const { ok, err } = rpcOk(data)
  return ok ? { error: null } : { error: err ?? 'Не удалось удалить чат' }
}

export async function leaveGroupOrChannelClient(
  kind: 'group' | 'channel',
  conversationId: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  return kind === 'group' ? leaveGroupChat(cid) : leaveChannel(cid)
}
