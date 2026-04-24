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
  void rpcOk
  return { error: 'not_migrated' }
}

export async function deleteDirectConversationForAllClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  void rpcOk
  return { error: 'not_migrated' }
}

export async function deleteOwnedGroupOrChannelClient(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  void rpcOk
  return { error: 'not_migrated' }
}

export async function leaveGroupOrChannelClient(
  kind: 'group' | 'channel',
  conversationId: string,
): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  if (!cid) return { error: 'Не выбран чат' }
  return kind === 'group' ? leaveGroupChat(cid) : leaveChannel(cid)
}
