import { listMyChannels, type ChannelSummary } from './channels'
import { listMyGroupChats, type GroupChatSummary } from './groups'
import { listDirectConversationsForUser, type DirectConversationSummary } from './messenger'
import { listMyContactDisplayOverrides, type MyContactDisplayOverride } from './socialGraph'
import { legacyRpc } from '../api/legacyRpcApi'

export type MessengerConversationKind = 'direct' | 'group' | 'channel'

/** Результат поиска открытых групп/каналов (не только из «моих» чатов). */
export type OpenPublicConversationSearchHit = {
  id: string
  kind: 'group' | 'channel'
  title: string
  publicNick: string | null
  memberCount: number
  lastMessagePreview: string | null
  lastMessageAt: string | null
  avatarPath: string | null
  avatarThumbPath: string | null
  isPublic: boolean
  postingMode?: 'admins_only' | 'everyone'
  commentsMode?: 'everyone' | 'disabled'
  createdAt: string
}

export type MessengerConversationSummary = {
  id: string
  kind: MessengerConversationKind
  title: string
  createdAt: string
  lastMessageAt: string | null
  lastMessagePreview: string | null
  messageCount: number
  unreadCount: number
  /** Для kind=direct */
  otherUserId?: string | null
  /** Для kind=direct */
  avatarUrl?: string | null
  /** Для group/channel */
  isPublic?: boolean
  /** Для group/channel: ник для ссылок */
  publicNick?: string | null
  /** Для group/channel: лого в storage (messenger-media) */
  avatarPath?: string | null
  avatarThumbPath?: string | null
  /** Для group/channel */
  memberCount?: number
  requiredSubscriptionPlan?: string | null
  /** Для channel */
  postingMode?: 'admins_only' | 'everyone'
  commentsMode?: 'everyone' | 'disabled'
  /** Локальная строка в списке: заявка отправлена, пользователь ещё не участник */
  joinRequestPending?: boolean
}

export function buildJoinRequestPendingSidebarStub(args: {
  id: string
  kind: 'group' | 'channel'
  title: string
  isPublic: boolean
  publicNick?: string | null
  avatarPath?: string | null
  avatarThumbPath?: string | null
  memberCount?: number
  postingMode?: 'admins_only' | 'everyone'
  commentsMode?: 'everyone' | 'disabled'
}): MessengerConversationSummary {
  const now = new Date().toISOString()
  return {
    id: args.id,
    kind: args.kind,
    title: args.title,
    createdAt: now,
    lastMessageAt: now,
    lastMessagePreview: 'Запрос на вступление отправлен',
    messageCount: 0,
    unreadCount: 0,
    joinRequestPending: true,
    isPublic: args.isPublic,
    publicNick: args.publicNick ?? null,
    avatarPath: args.avatarPath ?? null,
    avatarThumbPath: args.avatarThumbPath ?? null,
    memberCount: args.memberCount ?? 0,
    postingMode: args.kind === 'channel' ? args.postingMode ?? 'admins_only' : undefined,
    commentsMode: args.kind === 'channel' ? args.commentsMode ?? 'everyone' : undefined,
  }
}

function mapDirect(c: DirectConversationSummary): MessengerConversationSummary {
  return { ...c, kind: 'direct' }
}

function mapGroup(g: GroupChatSummary): MessengerConversationSummary {
  return {
    id: g.id,
    kind: 'group',
    title: g.title,
    createdAt: g.createdAt,
    lastMessageAt: g.lastMessageAt,
    lastMessagePreview: g.lastMessagePreview,
    messageCount: g.messageCount,
    unreadCount: g.unreadCount,
    isPublic: g.isPublic,
    publicNick: g.publicNick,
    avatarPath: g.avatarPath,
    avatarThumbPath: g.avatarThumbPath,
    memberCount: g.memberCount,
    requiredSubscriptionPlan: g.requiredSubscriptionPlan,
  }
}

function mapChannel(ch: ChannelSummary): MessengerConversationSummary {
  return {
    id: ch.id,
    kind: 'channel',
    title: ch.title,
    createdAt: ch.createdAt,
    lastMessageAt: ch.lastMessageAt,
    lastMessagePreview: ch.lastMessagePreview,
    messageCount: ch.messageCount,
    unreadCount: ch.unreadCount,
    isPublic: ch.isPublic,
    publicNick: ch.publicNick,
    avatarPath: ch.avatarPath,
    avatarThumbPath: ch.avatarThumbPath,
    memberCount: ch.memberCount,
    requiredSubscriptionPlan: ch.requiredSubscriptionPlan,
    postingMode: ch.postingMode,
    commentsMode: ch.commentsMode,
  }
}

function sortByActivityDesc(a: MessengerConversationSummary, b: MessengerConversationSummary): number {
  const ta = new Date(a.lastMessageAt ?? a.createdAt).getTime()
  const tb = new Date(b.lastMessageAt ?? b.createdAt).getTime()
  if (ta !== tb) return tb - ta
  return b.id.localeCompare(a.id)
}

export async function listMessengerConversations(): Promise<{
  data: MessengerConversationSummary[] | null
  error: string | null
}> {
  const [d, g, c] = await Promise.all([
    listDirectConversationsForUser(),
    listMyGroupChats(),
    listMyChannels(),
  ])

  const err = d.error || g.error || c.error
  if (err) return { data: null, error: err }

  const items: MessengerConversationSummary[] = []
  for (const x of d.data ?? []) items.push(mapDirect(x))
  for (const x of g.data ?? []) items.push(mapGroup(x))
  for (const x of c.data ?? []) items.push(mapChannel(x))
  items.sort(sortByActivityDesc)
  return { data: items, error: null }
}

/** Подставляет в ЛС локальные имя и аватар из `contact_aliases` текущего пользователя. */
function applyMyContactDisplayOverridesToMessengerSummaries(
  items: MessengerConversationSummary[],
  overrides: Record<string, MyContactDisplayOverride> | null | undefined,
): MessengerConversationSummary[] {
  const map = overrides ?? {}
  if (!items.length || !Object.keys(map).length) return items
  return items.map((x) => {
    if (x.kind !== 'direct') return x
    const pid = typeof x.otherUserId === 'string' ? x.otherUserId.trim() : ''
    if (!pid) return x
    const row = map[pid]
    if (!row) return x
    const a = row.alias.trim()
    const av = row.displayAvatarUrl?.trim() ?? ''
    const nextTitle = a ? a : x.title
    const nextAvatar = av ? av : x.avatarUrl
    if (nextTitle === x.title && nextAvatar === x.avatarUrl) return x
    return { ...x, title: nextTitle, avatarUrl: nextAvatar }
  })
}

/** Список бесед как в `listMessengerConversations`, с учётом локальных имён для ЛС. */
export async function listMessengerConversationsWithContactAliases(): Promise<{
  data: MessengerConversationSummary[] | null
  error: string | null
}> {
  const base = await listMessengerConversations()
  if (base.error || !base.data) return base
  const directPeerIds = Array.from(
    new Set(
      base.data
        .filter((x) => x.kind === 'direct')
        .map((x) => (typeof x.otherUserId === 'string' ? x.otherUserId.trim() : ''))
        .filter(Boolean),
    ),
  )
  if (!directPeerIds.length) return base
  const dispRes = await listMyContactDisplayOverrides(directPeerIds)
  if (dispRes.error || !dispRes.data) return { data: base.data, error: null }
  return { data: applyMyContactDisplayOverridesToMessengerSummaries(base.data, dispRes.data), error: null }
}

function mapOpenPublicSearchRow(row: Record<string, unknown>): OpenPublicConversationSearchHit | null {
  const id = String(row.id ?? '')
  const kind = row.kind === 'channel' ? 'channel' : row.kind === 'group' ? 'group' : ''
  if (!id || !kind) return null
  return {
    id,
    kind,
    title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : kind === 'channel' ? 'Канал' : 'Группа',
    publicNick: typeof row.public_nick === 'string' && row.public_nick.trim() ? row.public_nick.trim() : null,
    memberCount: typeof row.member_count === 'number' ? row.member_count : Number(row.member_count ?? 0) || 0,
    lastMessagePreview:
      typeof row.last_message_preview === 'string' && row.last_message_preview.trim()
        ? row.last_message_preview.trim()
        : null,
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    avatarPath: typeof row.avatar_path === 'string' && row.avatar_path.trim() ? row.avatar_path.trim() : null,
    avatarThumbPath:
      typeof row.avatar_thumb_path === 'string' && row.avatar_thumb_path.trim() ? row.avatar_thumb_path.trim() : null,
    isPublic: row.is_public === true,
    postingMode: row.posting_mode === 'everyone' ? 'everyone' : row.posting_mode === 'admins_only' ? 'admins_only' : undefined,
    commentsMode: row.comments_mode === 'disabled' ? 'disabled' : row.comments_mode === 'everyone' ? 'everyone' : undefined,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
  }
}

export async function searchOpenPublicConversations(
  query: string,
  limit = 20,
): Promise<{ data: OpenPublicConversationSearchHit[] | null; error: string | null }> {
  const r = await legacyRpc('search_open_public_conversations', { p_query: query.trim(), p_limit: limit })
  if (r.error) return { data: null, error: r.error }
  const data = r.data
  const rows = Array.isArray(data) ? data : []
  const mapped = rows
    .map((r) => mapOpenPublicSearchRow(r as Record<string, unknown>))
    .filter((x): x is OpenPublicConversationSearchHit => x != null)
  return { data: mapped, error: null }
}

