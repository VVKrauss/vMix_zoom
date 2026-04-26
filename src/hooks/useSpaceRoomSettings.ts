import { useEffect, useState, useCallback } from 'react'
import type { SpaceRoomChatVisibility } from '../lib/spaceRoom'
import { dbTableSelectOne } from '../api/dbApi'
import { realtime } from '../api/realtime'

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
    void dbTableSelectOne<Record<string, unknown>>({
      table: 'space_rooms',
      select: 'slug,host_user_id,chat_visibility,access_mode,status,room_admin_user_ids',
      filters: { slug },
    }).then((r) => {
      if (!r.ok) {
        console.warn('useSpaceRoomSettings:', r.error.message)
        setRow(null)
        setLoading(false)
        return
      }
      setRow(parseRow(r.data.row ?? null))
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
    const ch = realtime.channel(`space_room:${slug}`)
    const off = ch.on((e) => {
      if (e.type !== 'db_change') return
      if (e.table !== 'space_rooms') return
      // backend может прислать row целиком; иначе делаем refresh().
      if (e.action === 'DELETE') {
        void refresh()
        return
      }
      const raw = (e as any).row as Record<string, unknown> | undefined
      if (raw) setRow(parseRow(raw))
      else void refresh()
    })
    ch.subscribe()
    return () => {
      off()
      ch.unsubscribe()
    }
  }, [slug, refresh])

  return { row, loading, refresh }
}
