import { supabase } from './supabase'
import { mapDirectMessageFromRow, type DirectMessage } from './messenger'

export type SubscribedFeedRow = {
  conversationId: string
  channelTitle: string
  message: DirectMessage
}

export async function listSubscribedChannelFeedPage(options?: {
  limit?: number
  before?: { createdAt: string; id: string } | null
}): Promise<{ data: SubscribedFeedRow[] | null; error: string | null; hasMoreOlder: boolean }> {
  const limit = Math.max(1, Math.min(options?.limit ?? 24, 60))
  const before = options?.before
  const { data, error } = await supabase.rpc('list_subscribed_channel_feed_page', {
    p_limit: limit,
    p_before_created_at: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
  })
  if (error) return { data: null, error: error.message, hasMoreOlder: false }
  const rows = Array.isArray(data) ? data : []
  const mapped: SubscribedFeedRow[] = []
  for (const raw of rows) {
    const row = raw as Record<string, unknown>
    const cid =
      typeof row.conversation_id === 'string'
        ? row.conversation_id.trim()
        : String(row.conversation_id ?? '').trim()
    if (!cid) continue
    const channelTitle =
      typeof row.channel_title === 'string' && row.channel_title.trim()
        ? row.channel_title.trim()
        : 'Канал'
    const msg = mapDirectMessageFromRow(row)
    if (!msg.id) continue
    mapped.push({ conversationId: cid, channelTitle, message: msg })
  }
  const hasMoreOlder = mapped.length === limit
  return { data: mapped, error: null, hasMoreOlder }
}

export async function setMessengerFeedAlwaysShow(value: boolean): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('set_messenger_feed_always_show', { p_value: value })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { error: typeof row?.error === 'string' ? row.error : 'not_saved' }
  return { error: null }
}

export async function upsertChannelPostDraft(
  conversationId: string,
  draft: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('upsert_channel_post_draft', {
    p_conversation_id: conversationId.trim(),
    p_draft: draft,
  })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { error: typeof row?.error === 'string' ? row.error : 'not_saved' }
  return { error: null }
}

export async function getChannelPostDraft(
  conversationId: string,
): Promise<{ ok: boolean; draft: unknown; error: string | null }> {
  const { data, error } = await supabase.rpc('get_channel_post_draft', {
    p_conversation_id: conversationId.trim(),
  })
  if (error) return { ok: false, draft: null, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    return { ok: false, draft: null, error: typeof row?.error === 'string' ? row.error : 'rpc_failed' }
  }
  return { ok: true, draft: row.draft ?? {}, error: null }
}

export async function deleteChannelPostDraft(conversationId: string): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('delete_channel_post_draft', {
    p_conversation_id: conversationId.trim(),
  })
  if (error) return { error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) return { error: typeof row?.error === 'string' ? row.error : 'not_deleted' }
  return { error: null }
}
