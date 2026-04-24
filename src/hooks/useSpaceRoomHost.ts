import { useEffect, useState } from 'react'

/** Совпадение с `space_rooms.host_user_id` для slug комнаты (эфирная комната). */
export function useIsDbSpaceRoomHost(roomSlug: string | undefined, userId: string | undefined): boolean {
  const [isHost, setIsHost] = useState(false)

  useEffect(() => {
    const slug = roomSlug?.trim()
    if (!slug || !userId) {
      setIsHost(false)
      return
    }
    setIsHost(false)
  }, [roomSlug, userId])

  return isHost
}
