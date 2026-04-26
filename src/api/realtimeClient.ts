export type RealtimeUnsubscribe = () => void

export type RealtimeEvent =
  | { type: 'db_change'; table: string; action: 'INSERT' | 'UPDATE' | 'DELETE'; row: unknown }
  | { type: 'broadcast'; channel: string; event: string; payload: unknown }

type Handler = (e: RealtimeEvent) => void

export class RealtimeClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private getUrl: () => string
  private lastUrl: string | null = null

  constructor(urlOrProvider: string | (() => string)) {
    this.getUrl = typeof urlOrProvider === 'function' ? urlOrProvider : () => urlOrProvider
  }

  private safeSend(payload: unknown): void {
    if (!this.ws) return
    // Avoid noisy errors when React unmounts while WS is closing.
    if (this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(JSON.stringify(payload))
    } catch {
      /* noop */
    }
  }

  connect(): void {
    const nextUrl = this.getUrl()
    const urlChanged = this.lastUrl != null && this.lastUrl !== nextUrl
    if (!urlChanged && this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    try {
      if (urlChanged) this.ws?.close()
    } catch {
      /* noop */
    }
    this.lastUrl = nextUrl
    this.ws = new WebSocket(nextUrl)
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
    this.safeSend({ type: 'broadcast', channel: ch, event: ev, payload })
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
        this.safeSend({ type: 'subscribe', channel: ch })
      },
      unsubscribe: () => {
        this.safeSend({ type: 'unsubscribe', channel: ch })
        this.handlers.delete(ch)
      },
    }
  }
}

