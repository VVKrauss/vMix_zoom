import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** Совпадение с `space_rooms.host_user_id` для slug комнаты (эфирная комната). */
export function useIsDbSpaceRoomHost(roomSlug: string | undefined, userId: string | undefined): boolean {
  const [isHost, setIsHost] = useState(false)

  useEffect(() => {
    const slug = roomSlug?.trim()
    if (!slug || !userId) {
      setIsHost(false)
      return
    }
    let cancelled = false
    void supabase
      .from('space_rooms')
      .select('host_user_id')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) {
          if (!cancelled) setIsHost(false)
          return
        }
        setIsHost(data?.host_user_id === userId)
      })
    return () => {
      cancelled = true
    }
  }, [roomSlug, userId])

  return isHost
}
