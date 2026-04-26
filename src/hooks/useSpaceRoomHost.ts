import { useEffect, useState } from 'react'
import { dbTableSelectOne } from '../api/dbApi'

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
      const r = await dbTableSelectOne<any>({
        table: 'space_rooms',
        select: 'host_user_id',
        filters: { slug },
      })
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
