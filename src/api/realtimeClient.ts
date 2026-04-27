export type RealtimeUnsubscribe = () => void

export type RealtimeEvent =
  | { type: 'db_change'; table: string; action: 'INSERT' | 'UPDATE' | 'DELETE'; row: unknown }
  | { type: 'broadcast'; channel: string; event: string; payload: unknown }

type Handler = (e: RealtimeEvent) => void
type AnyHandler = (e: any) => void

export class RealtimeClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<Handler>>()
  private anyHandlers = new Set<AnyHandler>()
  private getUrl: () => string
  private lastUrl: string | null = null
  private outbox: unknown[] = []
  private subscribed = new Set<string>()

  constructor(urlOrProvider: string | (() => string)) {
    this.getUrl = typeof urlOrProvider === 'function' ? urlOrProvider : () => urlOrProvider
  }

  private safeSend(payload: unknown): void {
    // Queue until the socket is open; otherwise subscribe/broadcast can be lost on slow networks.
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.outbox.push(payload)
      return
    }
    try {
      this.ws.send(JSON.stringify(payload))
    } catch {
      /* noop */
    }
  }

  private flushOutbox(): void {
    if (!this.ws) return
    if (this.ws.readyState !== WebSocket.OPEN) return
    if (!this.outbox.length) return
    const queued = this.outbox
    this.outbox = []
    for (let i = 0; i < queued.length; i++) {
      const p = queued[i]
      try {
        this.ws.send(JSON.stringify(p))
      } catch {
        // If sending fails, re-queue the rest for a later reconnect.
        this.outbox = [p, ...queued.slice(i + 1)]
        break
      }
    }
  }

  private resendSubscriptions(): void {
    if (!this.subscribed.size) return
    for (const ch of this.subscribed) {
      this.safeSend({ type: 'subscribe', channel: ch })
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
    this.ws.onopen = () => {
      // Re-send subscriptions and any queued messages once the socket is open.
      this.resendSubscriptions()
      this.flushOutbox()
    }
    this.ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(String(msg.data)) as any
        for (const h of this.anyHandlers) h(parsed)
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

  onAny(handler: AnyHandler): RealtimeUnsubscribe {
    this.anyHandlers.add(handler)
    return () => {
      this.anyHandlers.delete(handler)
    }
  }

  send(payload: unknown): void {
    this.connect()
    this.safeSend(payload)
  }

  isOpen(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN)
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
        if (ch) this.subscribed.add(ch)
        this.safeSend({ type: 'subscribe', channel: ch })
      },
      unsubscribe: () => {
        this.safeSend({ type: 'unsubscribe', channel: ch })
        if (ch) this.subscribed.delete(ch)
        this.handlers.delete(ch)
      },
    }
  }
}

