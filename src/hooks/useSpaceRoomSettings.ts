import { useEffect, useState, useCallback } from 'react'
import type { SpaceRoomChatVisibility } from '../lib/spaceRoom'

export type SpaceRoomAccessMode = 'link' | 'approval' | 'invite_only'

export type SpaceRoomSettingsRow = {
  slug: string
  hostUserId: string | null
  chatVisibility: SpaceRoomChatVisibility
  accessMode: SpaceRoomAccessMode
  status: string
  /** Со-администраторы комнаты (не хост). */
  roomAdminUserIds: string[]
}

function parseRow(raw: Record<string, unknown> | null): SpaceRoomSettingsRow | null {
  if (!raw) return null
  const slug = typeof raw.slug === 'string' ? raw.slug : ''
  if (!slug) return null
  const cv = raw.chat_visibility
  const chatVisibility: SpaceRoomChatVisibility =
    cv === 'everyone' ||
    cv === 'authenticated_only' ||
    cv === 'staff_only' ||
    cv === 'closed'
      ? cv
      : 'everyone'
  const am = raw.access_mode
  const accessMode: SpaceRoomAccessMode =
    am === 'approval' || am === 'invite_only' ? am : 'link'
  const ra = raw.room_admin_user_ids
  const roomAdminUserIds: string[] = Array.isArray(ra) ? ra.filter((x): x is string => typeof x === 'string') : []
  return {
    slug,
    hostUserId: typeof raw.host_user_id === 'string' ? raw.host_user_id : null,
    chatVisibility,
    accessMode,
    status: typeof raw.status === 'string' ? raw.status : '',
    roomAdminUserIds,
  }
}

/** Подписка на строку space_rooms по slug (политика чата, режим доступа и статус). */
export function useSpaceRoomSettings(roomSlug: string | undefined): {
  row: SpaceRoomSettingsRow | null
  loading: boolean
  refresh: () => void
} {
  const [row, setRow] = useState<SpaceRoomSettingsRow | null>(null)
  const [loading, setLoading] = useState(true)

  const slug = roomSlug?.trim() ?? ''

  const refresh = useCallback(() => {
    if (!slug) {
      setRow(null)
      setLoading(false)
      return
    }
    setRow(null)
    setLoading(false)
  }, [slug])

  useEffect(() => {
    if (!slug) {
      setRow(null)
      setLoading(false)
      return
    }
    setLoading(true)
    refresh()
  }, [slug, refresh])

  useEffect(() => {
    // Supabase realtime removed
    void slug
  }, [slug])

  return { row, loading, refresh }
}
