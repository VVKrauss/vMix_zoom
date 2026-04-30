import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isPeerPresenceOnlineFromMirror } from '../lib/messengerPeerPresence'

type PresenceMirrorRow = {
  userId: string
  lastActiveAt: string | null
  presenceLastBackgroundAt: string | null
  profileShowOnline: boolean | null
  /** Пользователь в звонке (комната); смысл только если он «онлайн» по last_active_at. */
  presenceInRoom: boolean
}

function mirrorRowToDbShape(prev: PresenceMirrorRow): Record<string, unknown> {
  return {
    user_id: prev.userId,
    last_active_at: prev.lastActiveAt,
    presence_last_background_at: prev.presenceLastBackgroundAt,
    profile_show_online: prev.profileShowOnline,
    presence_in_room: prev.presenceInRoom,
  }
}

/** Realtime часто шлёт только изменённые поля — мержим с кэшем, иначе теряется presence_in_room. */
function mergePresenceMirrorPayload(
  newRow: Record<string, unknown> | null,
  prevByUserId: Map<string, PresenceMirrorRow>,
): PresenceMirrorRow | null {
  const patch = newRow && typeof newRow === 'object' ? newRow : null
  if (!patch) return null
  const userId = typeof patch.user_id === 'string' ? patch.user_id.trim() : ''
  const prev = userId ? prevByUserId.get(userId) : undefined
  const base = prev ? mirrorRowToDbShape(prev) : {}
  return parsePresenceRow({ ...base, ...patch })
}

function parsePresenceRow(raw: unknown): PresenceMirrorRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const userId = typeof r.user_id === 'string' ? r.user_id.trim() : ''
  if (!userId) return null
  const rawInRoom = r.presence_in_room
  const presenceInRoom =
    typeof rawInRoom === 'boolean' ? rawInRoom : rawInRoom === null || rawInRoom === undefined ? false : Boolean(rawInRoom)

  return {
    userId,
    lastActiveAt:
      typeof r.last_active_at === 'string'
        ? r.last_active_at
        : r.last_active_at == null
          ? null
          : String(r.last_active_at),
    presenceLastBackgroundAt:
      typeof r.presence_last_background_at === 'string'
        ? r.presence_last_background_at
        : r.presence_last_background_at == null
          ? null
          : String(r.presence_last_background_at),
    profileShowOnline: typeof r.profile_show_online === 'boolean' ? r.profile_show_online : null,
    presenceInRoom,
  }
}

function computeOnline(row: PresenceMirrorRow, nowMs: number): boolean {
  return isPeerPresenceOnlineFromMirror(
    {
      lastActiveAt: row.lastActiveAt,
      presenceLastBackgroundAt: row.presenceLastBackgroundAt,
      profileShowOnline: row.profileShowOnline,
    },
    nowMs,
  )
}

/**
 * Единый источник «онлайн» для UI: только зеркало public.user_presence_public (select + realtime).
 * Никаких peek/RPC — поведение одинаковое в дереве и в шапке.
 */
export type OnlinePresenceMirrorMaps = {
  online: Record<string, boolean>
  /** Онлайн и отмечен как «в комнате» (для бледно-жёлтого кольца). */
  inRoom: Record<string, boolean>
}

export function useOnlinePresenceMirror(args: {
  viewerId: string | undefined
  userIds: readonly string[]
  /** Локальная переоценка окна online (нужно, чтобы оно гасло без новых событий). */
  tickMs?: number
}): OnlinePresenceMirrorMaps {
  const { viewerId, userIds, tickMs = 1500 } = args

  const key = useMemo(() => {
    const me = viewerId?.trim() ?? ''
    if (!me) return ''
    const ids = [...new Set(userIds.map((x) => x.trim()).filter(Boolean))]
      .filter((id) => id !== me)
      .sort()
    return ids.join('\0')
  }, [viewerId, userIds])

  const ids = useMemo(() => (key ? key.split('\0').filter(Boolean) : []), [key])

  const rowsRef = useRef<Map<string, PresenceMirrorRow>>(new Map())
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    rowsRef.current = new Map()
    setEpoch((e) => e + 1)
  }, [key])

  useEffect(() => {
    const me = viewerId?.trim() ?? ''
    if (!me || ids.length === 0) return

    let cancelled = false
    let channel: RealtimeChannel | null = null
    const bump = () => setEpoch((e) => e + 1)

    void (async () => {
      const { data, error } = await supabase
        .from('user_presence_public')
        .select('user_id,last_active_at,presence_last_background_at,profile_show_online,presence_in_room')
        .in('user_id', ids)
      if (cancelled || error) return

      const next = new Map<string, PresenceMirrorRow>()
      for (const raw of (data ?? []) as unknown[]) {
        const parsed = parsePresenceRow(raw)
        if (!parsed) continue
        next.set(parsed.userId, parsed)
      }
      rowsRef.current = next
      bump()
    })()

    const filter = ids.length === 1 ? `user_id=eq.${ids[0]}` : `user_id=in.(${ids.join(',')})`
    channel = supabase
      .channel(`presence-mirror:${ids.length}-${ids[0]?.slice(0, 8) ?? '0'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence_public', filter },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const ev = payload.eventType
          if (ev === 'DELETE') {
            const oldR = payload.old
            const delId = oldR && typeof oldR.user_id === 'string' ? oldR.user_id.trim() : ''
            if (delId && ids.includes(delId)) {
              rowsRef.current.delete(delId)
              bump()
            }
            return
          }
          const parsed = mergePresenceMirrorPayload(payload.new, rowsRef.current)
          if (!parsed) return
          if (!ids.includes(parsed.userId)) return
          rowsRef.current.set(parsed.userId, parsed)
          bump()
        },
      )
      .subscribe()

    const tickId = window.setInterval(bump, tickMs)
    return () => {
      cancelled = true
      window.clearInterval(tickId)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [viewerId, ids, tickMs])

  return useMemo(() => {
    const online: Record<string, boolean> = {}
    const inRoom: Record<string, boolean> = {}
    const nowMs = Date.now()
    for (const id of ids) {
      const row = rowsRef.current.get(id)
      const isOn = row ? computeOnline(row, nowMs) : false
      online[id] = isOn
      inRoom[id] = isOn && Boolean(row?.presenceInRoom)
    }
    // tie to epoch
    void epoch
    return { online, inRoom }
  }, [ids, epoch])
}

