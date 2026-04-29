import { realtime } from './realtime'
import type { RealtimeEvent, RealtimeUnsubscribe } from './realtimeClient'

type SupaLikeChannel = {
  on: (type: string, filter: any, cb: (payload: any) => void) => SupaLikeChannel
  subscribe: (cb?: (status: any) => void) => SupaLikeChannel
  send: (msg: any) => Promise<{ error: { message: string } | null }>
  unsubscribe: () => void
}

export function rtChannel(name: string): SupaLikeChannel {
  const chName = String(name ?? '').trim()
  const base = realtime.channel(chName)
  const offs: RealtimeUnsubscribe[] = []

  function onBase(handler: (e: RealtimeEvent) => void): void {
    const off = base.on(handler)
    offs.push(off)
  }

  const api: SupaLikeChannel = {
    on: (type, filter, cb) => {
      const t = String(type ?? '').trim()
      if (t === 'broadcast') {
        const want = String(filter?.event ?? '').trim()
        onBase((e) => {
          if (e.type !== 'broadcast') return
          if (want && e.event !== want) return
          cb({ event: e.event, payload: e.payload })
        })
        return api
      }
      if (t === 'postgres_changes') {
        onBase((e) => {
          if (e.type !== 'db_change') return
          cb({ new: e.row, table: e.table, eventType: e.action })
        })
        return api
      }
      return api
    },
    subscribe: (cb) => {
      base.subscribe()
      cb?.('SUBSCRIBED')
      return api
    },
    send: async (msg) => {
      const m = msg as { type?: string; event?: string; payload?: unknown } | null
      if (m?.type === 'broadcast') {
        const ev = String(m.event ?? '').trim()
        if (!chName || !ev) return { error: { message: 'bad_broadcast' } }
        realtime.broadcast(chName, ev, m.payload)
        return { error: null }
      }
      return { error: { message: 'unsupported_message_type' } }
    },
    unsubscribe: () => {
      for (const off of offs.splice(0)) off()
      base.unsubscribe()
    },
  }

  return api
}

export function rtRemoveChannel(ch: { unsubscribe?: () => void } | null | undefined): void {
  try {
    ch?.unsubscribe?.()
  } catch {
    /* noop */
  }
}

