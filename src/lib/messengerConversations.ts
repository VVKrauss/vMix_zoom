import { listMyChannels, type ChannelSummary } from './channels'
import { listMyGroupChats, type GroupChatSummary } from './groups'
import { listDirectConversationsForUser, type DirectConversationSummary } from './messenger'

export type MessengerConversationKind = 'direct' | 'group' | 'channel'

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

