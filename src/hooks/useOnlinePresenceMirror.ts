import { useEffect, useMemo, useRef, useState } from 'react'
import { isPeerPresenceOnlineFromMirror } from '../lib/messengerPeerPresence'

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
 * Единый источник «онлайн» для UI: только зеркало public.user_presence_public (select + realtime).
 * Никаких peek/RPC — поведение одинаковое в дереве и в шапке.
 */
export function useOnlinePresenceMirror(args: {
  viewerId: string | undefined
  userIds: readonly string[]
  /** Локальная переоценка окна online (нужно, чтобы оно гасло без новых событий). */
  tickMs?: number
}): Record<string, boolean> {
  // Presence mirror is disabled during backend migration.
  void isPeerPresenceOnlineFromMirror
  void args
  return {}
}
