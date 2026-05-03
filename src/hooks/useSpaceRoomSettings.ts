import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
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
  /** Уникальный суффикс канала: иначе два хука с одним slug (RoomSession + RoomPage) ломают Realtime. */
  const channelSuffixRef = useRef<string | null>(null)
  if (channelSuffixRef.current === null) {
    channelSuffixRef.current = `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  }

  const refresh = useCallback(() => {
    if (!slug) {
      setRow(null)
      setLoading(false)
      return
    }
    void supabase
      .from('space_rooms')
      .select('slug, host_user_id, chat_visibility, access_mode, status, room_admin_user_ids')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.warn('useSpaceRoomSettings:', error.message)
          setRow(null)
          setLoading(false)
          return
        }
        setRow(parseRow(data as Record<string, unknown>))
        setLoading(false)
      })
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
    if (!slug) return
    const ch = supabase
      .channel(`space_room:${slug}:${channelSuffixRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'space_rooms', filter: `slug=eq.${slug}` },
        (payload) => {
          const next = payload.new as Record<string, unknown> | undefined
          if (next) setRow(parseRow(next))
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(ch)
    }
  }, [slug])

  return { row, loading, refresh }
}
