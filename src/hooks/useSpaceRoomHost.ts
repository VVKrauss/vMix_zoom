import { useEffect, useState } from 'react'
import { fetchJson } from '../api/http'

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
    void (async () => {
      const r = await fetchJson<{ row: any | null }>(`/api/v1/space-rooms/${encodeURIComponent(slug)}/settings`, { method: 'GET', auth: true })
      if (cancelled || !r.ok) {
        if (!cancelled) setIsHost(false)
        return
      }
      setIsHost((r.data?.row as any)?.host_user_id === userId)
    })()
    return () => {
      cancelled = true
    }
  }, [roomSlug, userId])

  return isHost
}
