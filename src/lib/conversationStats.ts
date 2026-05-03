import { supabase } from './supabase'

export type ConversationAdminStatsDailyRow = {
  day: string
  messages: number
}

export type ConversationAdminStatsContributor = {
  user_id: string
  message_count: number
  display_name: string
}

export type ConversationAdminStatsPayload = {
  period_days: number
  conversation_kind: 'group' | 'channel'
  member_count: number
  pending_join_requests: number
  messages_non_reaction: number
  reactions_count: number
  unique_authors: number
  messages_with_reply: number | null
  channel_posts: number | null
  channel_comments: number | null
  members_by_role: Record<string, number>
  messages_by_kind: Record<string, number>
  top_contributors: ConversationAdminStatsContributor[]
  daily: ConversationAdminStatsDailyRow[]
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function parseNumberRecord(v: unknown): Record<string, number> {
  const o = asRecord(v)
  if (!o) return {}
  const out: Record<string, number> = {}
  for (const [k, val] of Object.entries(o)) {
    const n = typeof val === 'number' ? val : Number(val)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

function parseContributors(v: unknown): ConversationAdminStatsContributor[] {
  if (!Array.isArray(v)) return []
  const out: ConversationAdminStatsContributor[] = []
  for (const row of v) {
    const o = asRecord(row)
    if (!o) continue
    const user_id = typeof o.user_id === 'string' ? o.user_id : ''
    const message_count =
      typeof o.message_count === 'number' ? o.message_count : Number(o.message_count)
    const display_name =
      typeof o.display_name === 'string' && o.display_name.trim()
        ? o.display_name.trim()
        : 'Участник'
    if (!user_id || !Number.isFinite(message_count)) continue
    out.push({ user_id, message_count, display_name })
  }
  return out
}

function parseDaily(v: unknown): ConversationAdminStatsDailyRow[] {
  if (!Array.isArray(v)) return []
  const out: ConversationAdminStatsDailyRow[] = []
  for (const row of v) {
    const o = asRecord(row)
    if (!o) continue
    const day = typeof o.day === 'string' ? o.day : ''
    const messages = typeof o.messages === 'number' ? o.messages : Number(o.messages)
    if (!day || !Number.isFinite(messages)) continue
    out.push({ day, messages })
  }
  return out
}

function parsePayload(raw: Record<string, unknown>): ConversationAdminStatsPayload | null {
  const kind = raw.conversation_kind === 'channel' ? 'channel' : raw.conversation_kind === 'group' ? 'group' : null
  if (!kind) return null

  const messages_with_reply =
    raw.messages_with_reply === null || raw.messages_with_reply === undefined
      ? null
      : typeof raw.messages_with_reply === 'number'
        ? raw.messages_with_reply
        : Number(raw.messages_with_reply)

  const channel_posts =
    raw.channel_posts === null || raw.channel_posts === undefined
      ? null
      : typeof raw.channel_posts === 'number'
        ? raw.channel_posts
        : Number(raw.channel_posts)

  const channel_comments =
    raw.channel_comments === null || raw.channel_comments === undefined
      ? null
      : typeof raw.channel_comments === 'number'
        ? raw.channel_comments
        : Number(raw.channel_comments)

  return {
    period_days:
      typeof raw.period_days === 'number' ? raw.period_days : Number(raw.period_days) || 30,
    conversation_kind: kind,
    member_count: typeof raw.member_count === 'number' ? raw.member_count : Number(raw.member_count) || 0,
    pending_join_requests:
      typeof raw.pending_join_requests === 'number'
        ? raw.pending_join_requests
        : Number(raw.pending_join_requests) || 0,
    messages_non_reaction:
      typeof raw.messages_non_reaction === 'number'
        ? raw.messages_non_reaction
        : Number(raw.messages_non_reaction) || 0,
    reactions_count:
      typeof raw.reactions_count === 'number' ? raw.reactions_count : Number(raw.reactions_count) || 0,
    unique_authors:
      typeof raw.unique_authors === 'number' ? raw.unique_authors : Number(raw.unique_authors) || 0,
    messages_with_reply: Number.isFinite(messages_with_reply as number) ? messages_with_reply : null,
    channel_posts: Number.isFinite(channel_posts as number) ? channel_posts : null,
    channel_comments: Number.isFinite(channel_comments as number) ? channel_comments : null,
    members_by_role: parseNumberRecord(raw.members_by_role),
    messages_by_kind: parseNumberRecord(raw.messages_by_kind),
    top_contributors: parseContributors(raw.top_contributors),
    daily: parseDaily(raw.daily),
  }
}

export async function fetchConversationAdminStats(
  conversationId: string,
  periodDays: 7 | 30 | 90,
): Promise<{ data: ConversationAdminStatsPayload | null; error: string | null }> {
  const id = conversationId.trim()
  if (!id) return { data: null, error: 'conversation_required' }

  const { data, error } = await supabase.rpc('get_conversation_admin_stats', {
    p_conversation_id: id,
    p_days: periodDays,
  })

  if (error) return { data: null, error: error.message }

  const row = asRecord(data as unknown)
  if (!row || row.ok !== true) {
    const code = typeof row?.error === 'string' ? row.error : 'stats_failed'
    if (code === 'forbidden') return { data: null, error: 'Недостаточно прав.' }
    if (code === 'not_found') return { data: null, error: 'Чат не найден.' }
    if (code === 'auth_required') return { data: null, error: 'Требуется вход.' }
    return { data: null, error: 'Не удалось загрузить статистику.' }
  }

  const parsed = parsePayload(row)
  if (!parsed) return { data: null, error: 'Не удалось разобрать ответ.' }
  return { data: parsed, error: null }
}
