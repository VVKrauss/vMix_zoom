export type RealtimeUnsubscribe = () => void

export type RealtimeEvent =
  | { type: 'db_change'; table: string; action: 'INSERT' | 'UPDATE' | 'DELETE'; row: unknown }
  | { type: 'broadcast'; channel: string; event: string; payload: unknown }

type Handler = (e: RealtimeEvent) => void

export class RealtimeClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private url: string

  constructor(url: string) {
    this.url = url
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.ws = new WebSocket(this.url)
    this.ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(String(msg.data)) as { channel?: string } & RealtimeEvent
        const ch = String(parsed.channel ?? '')
        if (!ch) return
        const set = this.handlers.get(ch)
        if (!set?.size) return
        for (const h of set) h(parsed)
      } catch {
        /* ignore */
      }
    }
  }

  broadcast(channel: string, event: string, payload: unknown): void {
    const ch = channel.trim()
    const ev = event.trim()
    if (!ch || !ev) return
    this.connect()
    try {
      this.ws?.send(JSON.stringify({ type: 'broadcast', channel: ch, event: ev, payload }))
    } catch {
      /* noop */
    }
  }

  channel(name: string): { on: (handler: Handler) => RealtimeUnsubscribe; subscribe: () => void; unsubscribe: () => void } {
    const ch = name.trim()
    return {
      on: (handler) => {
        const set = this.handlers.get(ch) ?? new Set<Handler>()
        set.add(handler)
        this.handlers.set(ch, set)
        return () => {
          const cur = this.handlers.get(ch)
          if (!cur) return
          cur.delete(handler)
          if (!cur.size) this.handlers.delete(ch)
        }
      },
      subscribe: () => {
        this.connect()
        try {
          this.ws?.send(JSON.stringify({ type: 'subscribe', channel: ch }))
        } catch {
          /* noop */
        }
      },
      unsubscribe: () => {
        try {
          this.ws?.send(JSON.stringify({ type: 'unsubscribe', channel: ch }))
        } catch {
          /* noop */
        }
        this.handlers.delete(ch)
      },
    }
  }
}

