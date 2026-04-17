import { supabase } from './supabase'
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
  const s = slug.trim()
  if (!s) return { data: null, error: 'Нет slug' }

  const { data, error } = await supabase.rpc('dashboard_room_stats_for_host', { p_slug: s })
  if (error) return { data: null, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    const err = typeof row?.error === 'string' ? row.error : 'request_failed'
    return { data: null, error: err }
  }

  return {
    data: {
      slug: typeof row.slug === 'string' ? row.slug : s,
      displayName: typeof row.displayName === 'string' ? row.displayName : null,
      roomStatus: typeof row.roomStatus === 'string' ? row.roomStatus : '',
      cumulativeOpenSeconds:
        typeof row.cumulativeOpenSeconds === 'number'
          ? row.cumulativeOpenSeconds
          : Number(row.cumulativeOpenSeconds ?? 0) || 0,
      openSessionStartedAt: typeof row.openSessionStartedAt === 'string' ? row.openSessionStartedAt : null,
      conversationId: typeof row.conversationId === 'string' ? row.conversationId : null,
      messageCount: typeof row.messageCount === 'number' ? row.messageCount : Number(row.messageCount ?? 0) || 0,
      chatCreatedAt: typeof row.chatCreatedAt === 'string' ? row.chatCreatedAt : null,
      chatClosedAt: typeof row.chatClosedAt === 'string' ? row.chatClosedAt : null,
      chatTitle: typeof row.chatTitle === 'string' ? row.chatTitle : null,
      registeredMemberCount:
        typeof row.registeredMemberCount === 'number'
          ? row.registeredMemberCount
          : Number(row.registeredMemberCount ?? 0) || 0,
    },
    error: null,
  }
}

export async function fetchRoomChatGuestsDashboard(
  conversationId: string,
): Promise<{ data: { guests: DashboardRoomGuestSender[]; guestDistinctCount: number } | null; error: string | null }> {
  const id = conversationId.trim()
  if (!id) return { data: null, error: 'Нет id' }

  const { data, error } = await supabase.rpc('list_room_chat_guest_senders_dashboard', {
    p_conversation_id: id,
  })
  if (error) return { data: null, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    const err = typeof row?.error === 'string' ? row.error : 'request_failed'
    return { data: null, error: err }
  }

  const rawGuests = row.guests
  const guests: DashboardRoomGuestSender[] = Array.isArray(rawGuests)
    ? rawGuests
        .map((g) => {
          const o = g as Record<string, unknown>
          return {
            senderPeerId: typeof o.senderPeerId === 'string' ? o.senderPeerId : '',
            senderNameSnapshot:
              typeof o.senderNameSnapshot === 'string' && o.senderNameSnapshot.trim()
                ? o.senderNameSnapshot.trim()
                : 'Гость',
            messageCount: typeof o.messageCount === 'number' ? o.messageCount : Number(o.messageCount ?? 0) || 0,
          }
        })
        .filter((g) => g.senderNameSnapshot || g.senderPeerId)
    : []

  const guestDistinctCount =
    typeof row.guestDistinctCount === 'number' ? row.guestDistinctCount : Number(row.guestDistinctCount ?? 0) || 0

  return { data: { guests, guestDistinctCount }, error: null }
}

export async function fetchRoomChatMembersDashboard(
  conversationId: string,
): Promise<{ data: DashboardRoomMemberProfile[] | null; error: string | null }> {
  const id = conversationId.trim()
  if (!id) return { data: null, error: 'Нет id' }

  const { data, error } = await supabase.rpc('list_room_chat_registered_members_dashboard', {
    p_conversation_id: id,
  })
  if (error) return { data: null, error: error.message }
  const row = data as Record<string, unknown> | null
  if (!row || row.ok !== true) {
    const err = typeof row?.error === 'string' ? row.error : 'request_failed'
    return { data: null, error: err }
  }

  const raw = row.members
  const members: DashboardRoomMemberProfile[] = Array.isArray(raw)
    ? raw
        .map((m) => {
          const o = m as Record<string, unknown>
          const uid = typeof o.userId === 'string' ? o.userId : ''
          if (!uid) return null
          return {
            userId: uid,
            displayName:
              typeof o.displayName === 'string' && o.displayName.trim() ? o.displayName.trim() : 'Участник',
            avatarUrl: typeof o.avatarUrl === 'string' && o.avatarUrl.trim() ? o.avatarUrl.trim() : null,
          }
        })
        .filter(Boolean) as DashboardRoomMemberProfile[]
    : []

  return { data: members, error: null }
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
