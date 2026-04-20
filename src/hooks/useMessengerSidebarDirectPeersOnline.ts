import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { MessengerConversationSummary } from '../lib/messengerConversations'
import { isPeerPresenceOnlineFromMirror, peerPresenceMirrorFromRow } from '../lib/messengerPeerPresence'

function rowToOnline(row: Record<string, unknown>): boolean {
  return isPeerPresenceOnlineFromMirror(peerPresenceMirrorFromRow(row))
}

/**
 * Онлайн-состояние собеседников в дереве чатов (только ЛС + пользователи из глобального поиска).
 * Источник: зеркало `user_presence_public` + realtime по тем же id.
 */
export function useMessengerSidebarDirectPeersOnline(
  viewerId: string | undefined,
  items: MessengerConversationSummary[],
  extraUserIds: readonly string[],
): Record<string, boolean> {
  const peerIdKey = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) {
      if (it.kind !== 'direct') continue
      const o = it.otherUserId?.trim()
      if (o && viewerId && o !== viewerId) s.add(o)
    }
    for (const raw of extraUserIds) {
      const id = raw.trim()
      if (id && viewerId && id !== viewerId) s.add(id)
    }
    return [...s].sort().join('\0')
  }, [items, extraUserIds, viewerId])

  const [onlineByUserId, setOnlineByUserId] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!viewerId) {
      setOnlineByUserId({})
      return
    }
    const ids = peerIdKey ? peerIdKey.split('\0').filter(Boolean) : []
    if (ids.length === 0) {
      setOnlineByUserId({})
      return
    }

    let cancelled = false
    const idSet = new Set(ids)

    void (async () => {
      const { data, error } = await supabase
        .from('user_presence_public')
        .select('user_id,last_active_at,presence_last_background_at,profile_show_online')
        .in('user_id', ids)
      if (cancelled || error) return
      const rows = (data ?? []) as Record<string, unknown>[]
      const next: Record<string, boolean> = {}
      for (const row of rows) {
        const uid = typeof row.user_id === 'string' ? row.user_id : ''
        if (!uid) continue
        next[uid] = rowToOnline(row)
      }
      setOnlineByUserId(next)
    })()

    const filter = ids.length === 1 ? `user_id=eq.${ids[0]}` : `user_id=in.(${ids.join(',')})`

    const channel = supabase
      .channel(`sidebar-presence:${ids.length}-${ids[0]?.slice(0, 8) ?? '0'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence_public', filter },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined
          if (!row || typeof row !== 'object') return
          const uid = typeof row.user_id === 'string' ? row.user_id : ''
          if (!uid || !idSet.has(uid)) return
          setOnlineByUserId((prev) => ({ ...prev, [uid]: rowToOnline(row) }))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [viewerId, peerIdKey])

  return onlineByUserId
}
