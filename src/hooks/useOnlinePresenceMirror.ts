import { useEffect, useMemo, useRef, useState } from 'react'
import { isPeerPresenceOnlineFromMirror } from '../lib/messengerPeerPresence'
import { v1ListUserPresencePublicByIds } from '../api/presenceMirrorApi'
import { rtChannel, rtRemoveChannel } from '../api/realtimeCompat'

type PresenceMirrorRow = {
  userId: string
  lastActiveAt: string | null
  presenceLastBackgroundAt: string | null
  profileShowOnline: boolean | null
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
 * Единый источник «онлайн» для UI: зеркало public.user_presence_public (GET + WebSocket `db_change` на `peer-presence:{userId}` + редкий опрос).
 * Никаких peek/RPC — поведение одинаковое в дереве и в шапке.
 */
export function useOnlinePresenceMirror(args: {
  viewerId: string | undefined
  userIds: readonly string[]
  /** Локальная переоценка окна online (нужно, чтобы оно гасло без новых событий). */
  tickMs?: number
}): Record<string, boolean> {
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
    const bump = () => setEpoch((e) => e + 1)

    const refreshFromApi = async () => {
      const { data, error } = await v1ListUserPresencePublicByIds(ids)
      if (cancelled || error || !data) return
      const next = new Map<string, PresenceMirrorRow>()
      for (const raw of data as unknown[]) {
        const parsed = parsePresenceRow(raw)
        if (!parsed) continue
        next.set(parsed.userId, parsed)
      }
      rowsRef.current = next
      bump()
    }

    void refreshFromApi()

    const rtChannels: Array<ReturnType<typeof rtChannel>> = []
    for (const peerId of ids) {
      const ch = rtChannel(`peer-presence:${peerId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence_public' }, (payload: any) => {
          if (cancelled) return
          if (String(payload?.table ?? '') !== 'user_presence_public') return
          const ev = String(payload?.eventType ?? '')
          const row = (payload?.new ?? null) as Record<string, unknown> | null
          if (ev === 'DELETE') {
            rowsRef.current.delete(peerId)
            bump()
            return
          }
          if (!row) {
            void refreshFromApi()
            return
          }
          const parsed = parsePresenceRow(row)
          if (parsed) rowsRef.current.set(parsed.userId, parsed)
          bump()
        })
        .subscribe()
      rtChannels.push(ch)
    }

    const REFRESH_MS = 60_000
    const refreshId = window.setInterval(() => {
      void refreshFromApi()
    }, REFRESH_MS)

    const tickId = window.setInterval(bump, tickMs)
    return () => {
      cancelled = true
      for (const c of rtChannels) rtRemoveChannel(c)
      window.clearInterval(tickId)
      window.clearInterval(refreshId)
    }
  }, [viewerId, ids, tickMs])

  return useMemo(() => {
    const out: Record<string, boolean> = {}
    const nowMs = Date.now()
    for (const id of ids) {
      const row = rowsRef.current.get(id)
      out[id] = row ? computeOnline(row, nowMs) : false
    }
    // tie to epoch
    void epoch
    return out
  }, [ids, epoch])
}

