import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  MESSENGER_JUMP_FAB_SCROLL_EPSILON_PX,
  messengerScrollDistanceFromBottom,
  messengerScrollMaxScrollTop,
} from '../lib/messengerDashboardUtils'

/**
 * FAB «вниз»: показываем, если нижний сентинел ленты не виден в корне скролла.
 * Дополнительно учитываем scroll-метрики с небольшим eps — из‑за overflow у реакций `scrollHeight`
 * может не совпадать с «мы уже внизу» при ползунке у края.
 *
 * @param tailRef необязательный узел внизу контента (как {@link readTailRef}); без него — только метрики.
 * @param activeKey Смена ключа пересоздаёт подписки (например, другой диалог).
 * @param remeasureKey Изменение без смены ключа — быстрый пересчёт (например, число сообщений).
 */
export function useMessengerJumpToBottom(
  scrollRef: React.RefObject<HTMLElement | null>,
  activeKey: string,
  remeasureKey?: string | number,
  tailRef?: React.RefObject<HTMLElement | null>,
): { showJump: boolean; jumpToBottom: () => void } {
  const [showJump, setShowJump] = useState(false)
  const tailIntersectingRef = useRef(false)

  const computeAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    const maxTop = messengerScrollMaxScrollTop(el)
    const d = messengerScrollDistanceFromBottom(el)
    const byScroll = maxTop <= 0 || d <= MESSENGER_JUMP_FAB_SCROLL_EPSILON_PX
    const tail = tailRef?.current ?? null
    if (!tailRef || !tail) return byScroll
    return tailIntersectingRef.current || byScroll
  }, [scrollRef, tailRef])

  const publish = useCallback(() => {
    setShowJump(!computeAtBottom())
  }, [computeAtBottom])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    const tail = tailRef?.current ?? null
    tailIntersectingRef.current = false

    let io: IntersectionObserver | null = null
    if (tailRef && tail) {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[0]
          tailIntersectingRef.current = Boolean(e?.isIntersecting)
          publish()
        },
        { root: scroll, threshold: [0, 0.01, 1] },
      )
      io.observe(tail)
    }

    publish()
    scroll.addEventListener('scroll', publish, { passive: true })
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            publish()
          })
        : null
    ro?.observe(scroll)
    if (tail) ro?.observe(tail)

    return () => {
      scroll.removeEventListener('scroll', publish)
      io?.disconnect()
      ro?.disconnect()
    }
  }, [scrollRef, tailRef, activeKey, publish])

  useLayoutEffect(() => {
    publish()
  }, [publish, remeasureKey])

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const top = messengerScrollMaxScrollTop(el)
    el.scrollTo({ top, behavior: 'smooth' })
  }, [scrollRef])

  return { showJump, jumpToBottom }
}
