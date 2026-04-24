import type { RoomChatConversationSummary } from './chatArchive'
import type { PersistentSpaceRoomRow } from './spaceRoom'
import { spaceRoomEffectiveOpenSeconds } from './spaceRoom'

export type DashboardRoomGuestSender = {
  senderPeerId: string
  senderNameSnapshot: string
  messageCount: number
}

export type DashboardRoomMemberProfile = {
  userId: string
  displayName: string
  avatarUrl: string | null
}

export type DashboardHostRoomStats = {
  slug: string
  displayName: string | null
  roomStatus: string
  cumulativeOpenSeconds: number
  openSessionStartedAt: string | null
  conversationId: string | null
  messageCount: number
  chatCreatedAt: string | null
  chatClosedAt: string | null
  chatTitle: string | null
  registeredMemberCount: number
}

/** Секунды «эфира»: накопленные + текущая открытая сессия. */
export function hostRoomBroadcastSeconds(stats: DashboardHostRoomStats): number {
  return spaceRoomEffectiveOpenSeconds({
    cumulativeOpenSeconds: stats.cumulativeOpenSeconds,
    openSessionStartedAt: stats.openSessionStartedAt,
    status: stats.roomStatus,
  })
}

export async function fetchDashboardRoomStatsForHost(
  slug: string,
): Promise<{ data: DashboardHostRoomStats | null; error: string | null }> {
  void slug
  return { data: null, error: 'not_migrated' }
}

export async function fetchRoomChatGuestsDashboard(
  conversationId: string,
): Promise<{ data: { guests: DashboardRoomGuestSender[]; guestDistinctCount: number } | null; error: string | null }> {
  void conversationId
  return { data: null, error: 'not_migrated' }
}

export async function fetchRoomChatMembersDashboard(
  conversationId: string,
): Promise<{ data: DashboardRoomMemberProfile[] | null; error: string | null }> {
  void conversationId
  return { data: [], error: 'not_migrated' }
}

/** Оценка окна чата без строки space_rooms (временные комнаты только в архиве). */
export function approximateChatSpanSeconds(summary: RoomChatConversationSummary): number | null {
  const created = new Date(summary.createdAt).getTime()
  if (Number.isNaN(created)) return null
  const endIso = summary.closedAt ?? summary.lastMessageAt
  if (!endIso) return null
  const end = new Date(endIso).getTime()
  if (Number.isNaN(end)) return null
  const d = Math.floor((end - created) / 1000)
  return d >= 0 ? d : null
}

export type DashboardRoomModalSubject =
  | { kind: 'persistent'; slug: string; preview?: PersistentSpaceRoomRow | null }
  | { kind: 'archive'; summary: RoomChatConversationSummary }
