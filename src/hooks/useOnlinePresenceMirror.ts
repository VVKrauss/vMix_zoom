import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { peerPresenceDisplayFromMirrorRow, type PeerPresenceDisplay } from '../lib/messengerPeerPresence'

type PresenceMirrorRow = {
  userId: string
  lastActiveAt: string | null
  presenceLastBackgroundAt: string | null
  profileShowOnline: boolean | null
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

function parsePresenceInRoomLoose(raw: unknown): boolean {
  if (raw === true) return true
  if (raw === false || raw == null) return false
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase()
    return t === 't' || t === 'true' || t === '1' || t === 'yes'
  }
  if (typeof raw === 'number') return raw !== 0
  return false
}

function readUserIdFromPayload(
  newRow: Record<string, unknown> | null,
  oldRow: Record<string, unknown> | null,
  singlePeerFallback: string | undefined,
): string {
  const n = newRow?.user_id
  if (typeof n === 'string' && n.trim()) return n.trim()
  const o = oldRow?.user_id
  if (typeof o === 'string' && o.trim()) return o.trim()
  const f = singlePeerFallback?.trim()
  return f ?? ''
}

/** Realtime часто шлёт только изменённые поля — мержим с кэшем; user_id может быть только в `old`. */
function mergePresenceMirrorPayload(
  newRow: Record<string, unknown> | null,
  oldRow: Record<string, unknown> | null,
  prevByUserId: Map<string, PresenceMirrorRow>,
  singlePeerFallback: string | undefined,
): PresenceMirrorRow | null {
  const patch = newRow && typeof newRow === 'object' ? newRow : null
  const old = oldRow && typeof oldRow === 'object' ? oldRow : null
  const userId = readUserIdFromPayload(patch, old, singlePeerFallback)
  if (!userId) return null
  const prev = prevByUserId.get(userId)
  const base = prev ? mirrorRowToDbShape(prev) : { user_id: userId }
  const merged = { ...base, ...(patch ?? {}) }
  return parsePresenceRow(merged)
}

function parsePresenceRow(raw: unknown): PresenceMirrorRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const userId = typeof r.user_id === 'string' ? r.user_id.trim() : ''
  if (!userId) return null

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
    presenceInRoom: parsePresenceInRoomLoose(r.presence_in_room),
  }
}

function rowToDisplayInput(row: PresenceMirrorRow) {
  return {
    lastActiveAt: row.lastActiveAt,
    presenceLastBackgroundAt: row.presenceLastBackgroundAt,
    profileShowOnline: row.profileShowOnline,
    presenceInRoom: row.presenceInRoom,
  }
}

/**
 * Единый источник присутствия для UI: зеркало public.user_presence_public (select + realtime).
 * Состояние считается в порядке: оффлайн → онлайн → в звонке (`in_call`).
 */
export function useOnlinePresenceMirror(args: {
  viewerId: string | undefined
  userIds: readonly string[]
  /** Локальная переоценка окна online (нужно, чтобы оно гасло без новых событий). */
  tickMs?: number
}): Record<string, PeerPresenceDisplay> {
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

  const singlePeerFallback = useMemo(() => (ids.length === 1 ? ids[0] : undefined), [ids])

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
          const parsed = mergePresenceMirrorPayload(
            payload.new,
            payload.old,
            rowsRef.current,
            singlePeerFallback,
          )
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
  }, [viewerId, ids, tickMs, singlePeerFallback])

  return useMemo(() => {
    const out: Record<string, PeerPresenceDisplay> = {}
    const nowMs = Date.now()
    for (const id of ids) {
      const row = rowsRef.current.get(id)
      out[id] = peerPresenceDisplayFromMirrorRow(row ? rowToDisplayInput(row) : undefined, nowMs)
    }
    void epoch
    return out
  }, [ids, epoch])
}
