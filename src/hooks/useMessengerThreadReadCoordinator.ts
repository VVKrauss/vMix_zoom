import { useEffect, useRef, type RefObject } from 'react'
import { markChannelRead } from '../lib/channels'
import { markGroupRead } from '../lib/groups'
import { markDirectConversationRead } from '../lib/messenger'

export type MessengerReadThreadKind = 'direct' | 'group' | 'channel'

export type MessengerThreadReadCoordinatorOpts = {
  conversationId: string
  kind: MessengerReadThreadKind | null
  enabled: boolean
  threadLoading: boolean
  scrollRef: RefObject<HTMLElement | null>
  readTailRef: RefObject<HTMLElement | null>
  lastSignificantMessageId: string | null
  onMarkedRead?: () => void
}

/** После того как хвост ленты попал в видимую область скролла — пауза, чтобы не считать «прочитано» при быстром пролистывании. */
const READ_DWELL_MS = 450

function isTailVisibleInScrollRoot(tail: HTMLElement, scrollRoot: HTMLElement): boolean {
  const rootRect = scrollRoot.getBoundingClientRect()
  const tailRect = tail.getBoundingClientRect()
  if (tailRect.height <= 0 && tailRect.width <= 0) return false
  const visibleY = Math.min(rootRect.bottom, tailRect.bottom) - Math.max(rootRect.top, tailRect.top)
  return visibleY >= Math.min(24, tailRect.height * 0.35)
}

async function markThreadRead(kind: MessengerReadThreadKind, conversationId: string): Promise<boolean> {
  const cid = conversationId.trim()
  if (!cid) return false
  if (kind === 'direct') {
    const { error } = await markDirectConversationRead(cid)
    return !error
  }
  if (kind === 'group') {
    const { error } = await markGroupRead(cid)
    return !error
  }
  const { error } = await markChannelRead(cid)
  return !error
}

/**
 * Единая политика «прочитано»: вкладка видима, хвост ленты (sentinel) в области скролла с небольшой задержкой.
 * Реакции не участвуют в ленте — sentinel внизу значимых сообщений.
 */
export function useMessengerThreadReadCoordinator(opts: MessengerThreadReadCoordinatorOpts): void {
  const {
    conversationId,
    kind,
    enabled,
    threadLoading,
    scrollRef,
    readTailRef,
    lastSignificantMessageId,
  } = opts

  const lastMarkedForTailRef = useRef<string | null>(null)
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ioRef = useRef<IntersectionObserver | null>(null)
  const pendingFlushOnUnmountRef = useRef(false)
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    lastMarkedForTailRef.current = null
  }, [conversationId, kind, lastSignificantMessageId])

  useEffect(() => {
    const cid = conversationId.trim()
    const k = kind
    if (!cid || !k || !enabled || threadLoading) {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
      }
      ioRef.current?.disconnect()
      ioRef.current = null
      return
    }

    let cancelled = false
    let retryRaf = 0
    let rafAttempts = 0
    const MAX_RAF_ATTACH = 90

    const clearDwell = () => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current)
        dwellTimerRef.current = null
      }
    }

    const tryMark = async () => {
      const o = optsRef.current
      const tailId = o.lastSignificantMessageId
      if (!tailId) return
      if (lastMarkedForTailRef.current === tailId) return
      if (document.visibilityState !== 'visible') return
      const scroll = o.scrollRef.current
      const tail = o.readTailRef.current
      if (!scroll || !tail) return
      if (!isTailVisibleInScrollRoot(tail, scroll)) return
      const ok = await markThreadRead(o.kind!, o.conversationId)
      if (!ok || cancelled) return
      lastMarkedForTailRef.current = tailId
      o.onMarkedRead?.()
    }

    const scheduleDwell = () => {
      clearDwell()
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null
        if (cancelled) return
        if (document.visibilityState !== 'visible') return
        void tryMark()
      }, READ_DWELL_MS)
    }

    const attach = () => {
      if (cancelled) return
      const scroll = scrollRef.current
      const tail = readTailRef.current
      if (!scroll || !tail) {
        if (rafAttempts < MAX_RAF_ATTACH) {
          rafAttempts += 1
          retryRaf = requestAnimationFrame(attach)
        }
        return
      }
      rafAttempts = 0

      ioRef.current?.disconnect()
      const io = new IntersectionObserver(
        (entries) => {
          const e = entries[0]
          const intersecting = Boolean(e?.isIntersecting && e.intersectionRatio > 0)
          pendingFlushOnUnmountRef.current = intersecting
          if (intersecting && document.visibilityState === 'visible') {
            scheduleDwell()
          } else {
            clearDwell()
          }
        },
        { root: scroll, rootMargin: '0px 0px 0px 0px', threshold: [0, 0.02, 0.08, 0.2] },
      )
      io.observe(tail)
      ioRef.current = io
    }

    attach()

    const onVis = () => {
      if (document.visibilityState !== 'visible') {
        clearDwell()
        return
      }
      const scroll = scrollRef.current
      const tail = readTailRef.current
      if (scroll && tail && isTailVisibleInScrollRoot(tail, scroll)) {
        scheduleDwell()
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      cancelAnimationFrame(retryRaf)
      document.removeEventListener('visibilitychange', onVis)
      clearDwell()
      ioRef.current?.disconnect()
      ioRef.current = null
      const flushCid = conversationId.trim()
      const flushKind = kind
      if (
        pendingFlushOnUnmountRef.current &&
        document.visibilityState === 'visible' &&
        flushCid &&
        flushKind
      ) {
        const tailId = optsRef.current.lastSignificantMessageId
        if (tailId) {
          void markThreadRead(flushKind, flushCid).then((ok) => {
            if (ok) {
              lastMarkedForTailRef.current = tailId
              optsRef.current.onMarkedRead?.()
            }
          })
        }
      }
      pendingFlushOnUnmountRef.current = false
    }
  }, [conversationId, kind, enabled, threadLoading, scrollRef, readTailRef])
}
