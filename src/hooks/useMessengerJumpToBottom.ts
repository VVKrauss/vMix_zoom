import { useCallback, useLayoutEffect, useState } from 'react'

const SLACK_PX = 96

/**
 * Кнопка «вниз»: показываем, если пользователь прокрутил ленту выше хвоста.
 * @param activeKey Смена ключа пересоздаёт подписки (например, другой диалог).
 * @param remeasureKey Опционально: изменение без смены подписок (например, число сообщений) — только пересчёт видимости FAB.
 */
export function useMessengerJumpToBottom(
  scrollRef: React.RefObject<HTMLElement | null>,
  activeKey: string,
  remeasureKey?: string | number,
): { showJump: boolean; jumpToBottom: () => void } {
  const [showJump, setShowJump] = useState(false)

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > SLACK_PX)
  }, [scrollRef])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [scrollRef, measure, activeKey])

  useLayoutEffect(() => {
    measure()
  }, [measure, remeasureKey])

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [scrollRef])

  return { showJump, jumpToBottom }
}
