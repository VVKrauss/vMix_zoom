import { legacyRpc } from '../api/legacyRpcApi'

export type PublicGuestPreviewMessage = {
  id: string
  sender_user_id: string | null
  sender_name_snapshot: string
  kind: string
  body: string
  meta: Record<string, unknown>
  created_at: string
  edited_at?: string | null
  reply_to_message_id?: string | null
  quote_to_message_id?: string | null
}

export type PublicGuestPreviewOk = {
  conversationId: string
  kind: 'group' | 'channel'
  title: string
  publicNick: string | null
  memberCount: number
  avatarPath: string | null
  avatarThumbPath: string | null
  channelPostingMode: 'admins_only' | 'everyone' | null
  channelCommentsMode: 'everyone' | 'disabled' | null
  messages: PublicGuestPreviewMessage[]
}

export type PublicGuestPreviewResult =
  | { ok: true; data: PublicGuestPreviewOk }
  | { ok: false; error: 'invalid_nick' | 'not_found' | 'not_public' | 'rpc' | 'parse'; message?: string }

function parseMessages(raw: unknown): PublicGuestPreviewMessage[] {
  if (!Array.isArray(raw)) return []
  const out: PublicGuestPreviewMessage[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    if (!id) continue
    const meta = o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta) ? (o.meta as Record<string, unknown>) : {}
    out.push({
      id,
      sender_user_id: typeof o.sender_user_id === 'string' ? o.sender_user_id : null,
      sender_name_snapshot:
        typeof o.sender_name_snapshot === 'string' && o.sender_name_snapshot.trim()
          ? o.sender_name_snapshot.trim()
          : 'Участник',
      kind: typeof o.kind === 'string' ? o.kind : 'text',
      body: typeof o.body === 'string' ? o.body : '',
      meta,
      created_at: typeof o.created_at === 'string' ? o.created_at : new Date(0).toISOString(),
      edited_at: typeof o.edited_at === 'string' ? o.edited_at : null,
      reply_to_message_id: typeof o.reply_to_message_id === 'string' ? o.reply_to_message_id : null,
      quote_to_message_id: typeof o.quote_to_message_id === 'string' ? o.quote_to_message_id : null,
    })
  }
  return out
}

/**
 * Превью открытой группы/канала по @public_nick (RPC доступен гостю).
 */
export async function fetchPublicConversationGuestPreview(
  publicNick: string,
  messageLimit = 40,
): Promise<PublicGuestPreviewResult> {
  const nick = publicNick.trim()
  if (!nick) return { ok: false, error: 'invalid_nick' }

  const r = await legacyRpc('get_public_conversation_guest_preview', { p_public_nick: nick, p_message_limit: messageLimit })
  if (r.error) return { ok: false, error: 'rpc', message: r.error }
  const data = r.data

  if (!data || typeof data !== 'object') return { ok: false, error: 'parse' }
  const j = data as Record<string, unknown>
  if (j.ok !== true) {
    const code = typeof j.error === 'string' ? j.error : ''
    if (code === 'not_found') return { ok: false, error: 'not_found' }
    if (code === 'not_public') return { ok: false, error: 'not_public' }
    if (code === 'invalid_nick') return { ok: false, error: 'invalid_nick' }
    return { ok: false, error: 'parse' }
  }

  const cid = typeof j.conversation_id === 'string' ? j.conversation_id : ''
  const kind = j.kind === 'channel' ? 'channel' : j.kind === 'group' ? 'group' : null
  if (!cid || !kind) return { ok: false, error: 'parse' }

  return {
    ok: true,
    data: {
      conversationId: cid,
      kind,
      title: typeof j.title === 'string' && j.title.trim() ? j.title.trim() : kind === 'channel' ? 'Канал' : 'Группа',
      publicNick: typeof j.public_nick === 'string' && j.public_nick.trim() ? j.public_nick.trim() : null,
      memberCount:
        typeof j.member_count === 'number' ? j.member_count : Number(j.member_count ?? 0) || 0,
      avatarPath: typeof j.avatar_path === 'string' && j.avatar_path.trim() ? j.avatar_path.trim() : null,
      avatarThumbPath:
        typeof j.avatar_thumb_path === 'string' && j.avatar_thumb_path.trim() ? j.avatar_thumb_path.trim() : null,
      channelPostingMode:
        j.channel_posting_mode === 'everyone'
          ? 'everyone'
          : j.channel_posting_mode === 'admins_only'
            ? 'admins_only'
            : null,
      channelCommentsMode:
        j.channel_comments_mode === 'disabled'
          ? 'disabled'
          : j.channel_comments_mode === 'everyone'
            ? 'everyone'
            : null,
      messages: parseMessages(j.messages),
    },
  }
}
