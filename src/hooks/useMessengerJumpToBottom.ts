import { useCallback, useLayoutEffect, useState } from 'react'
import { messengerScrollDistanceFromBottom, messengerScrollMaxScrollTop } from '../lib/messengerDashboardUtils'

/** Показываем FAB «вниз», если прокрутка дальше чем на столько от низа. */
const MESSENGER_JUMP_FAB_NEAR_BOTTOM_PX = 30

/**
 * FAB «в последние сообщения»: видна всегда, кроме случая когда скролл у нижнего края
 * (расстояние до низа ≤ {@link MESSENGER_JUMP_FAB_NEAR_BOTTOM_PX}).
 *
 * @param activeKey Смена ключа пересоздаёт подписки (например, другой диалог).
 * @param remeasureKey Изменение без смены ключа — пересчёт (например, число сообщений).
 */
export function useMessengerJumpToBottom(
  scrollRef: React.RefObject<HTMLElement | null>,
  activeKey: string,
  remeasureKey?: string | number,
): { showJump: boolean; jumpToBottom: () => void } {
  const [showJump, setShowJump] = useState(false)

  const publish = useCallback(() => {
    const el = scrollRef.current
    if (!el) {
      setShowJump(false)
      return
    }
    const d = messengerScrollDistanceFromBottom(el)
    setShowJump(d > MESSENGER_JUMP_FAB_NEAR_BOTTOM_PX)
  }, [scrollRef])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return

    publish()
    scroll.addEventListener('scroll', publish, { passive: true })
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            publish()
          })
        : null
    ro?.observe(scroll)

    return () => {
      scroll.removeEventListener('scroll', publish)
      ro?.disconnect()
    }
  }, [scrollRef, activeKey, publish])

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
