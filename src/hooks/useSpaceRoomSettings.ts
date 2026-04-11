import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { SpaceRoomChatVisibility } from '../lib/spaceRoom'

export type SpaceRoomSettingsRow = {
  slug: string
  hostUserId: string | null
  chatVisibility: SpaceRoomChatVisibility
  status: string
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
  return {
    slug,
    hostUserId: typeof raw.host_user_id === 'string' ? raw.host_user_id : null,
    chatVisibility,
    status: typeof raw.status === 'string' ? raw.status : '',
  }
}

/** Подписка на строку space_rooms по slug (политика чата и статус). */
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
    void supabase
      .from('space_rooms')
      .select('slug, host_user_id, chat_visibility, status')
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
      .channel(`space_room:${slug}`)
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
