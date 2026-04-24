import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * Присутствие на сайте: пока вкладка на переднем плане — периодический пульс;
 * при уходе в фон — отдельная отметка на сервере (момент «перестал быть на переднем плане»).
 */
export function usePresenceSession() {
  const { user } = useAuth()

  useEffect(() => {
    // Presence is still Supabase-based; disable during backend migration
    void user?.id
  }, [user?.id])
}
