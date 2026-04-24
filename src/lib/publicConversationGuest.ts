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
  void publicNick
  void messageLimit
  return { ok: false, error: 'rpc', message: 'not_migrated' }
}
