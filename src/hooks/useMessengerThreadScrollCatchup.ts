import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { MESSENGER_BOTTOM_PIN_PX } from '../lib/messengerDashboardUtils'

/** После окончания `threadLoading` — прокрутка вниз, если есть сообщения. */
export function useMessengerScrollAfterThreadLoad(opts: {
  threadLoading: boolean
  listOnlyMobile: boolean
  messagesLength: number
  messagesScrollRef: RefObject<HTMLDivElement | null>
  messengerPinnedToBottomRef: MutableRefObject<boolean>
}): void {
  const {
    threadLoading,
    listOnlyMobile,
    messagesLength,
    messagesScrollRef,
    messengerPinnedToBottomRef,
  } = opts
  const prevThreadLoadingRef = useRef(false)

  useLayoutEffect(() => {
    const wasLoading = prevThreadLoadingRef.current
    prevThreadLoadingRef.current = threadLoading
    if (wasLoading && !threadLoading && !listOnlyMobile && messagesLength > 0) {
      const el = messagesScrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
        messengerPinnedToBottomRef.current = true
      }
    }
  }, [threadLoading, listOnlyMobile, messagesLength])
}

/** Рост числа сообщений без загрузки страницы — догон низа, если пользователь был у хвоста. */
export function useMessengerScrollOnMessageGrowth(opts: {
  messagesLength: number
  threadLoading: boolean
  loadingOlder: boolean
  messagesScrollRef: RefObject<HTMLDivElement | null>
  messengerPinnedToBottomRef: MutableRefObject<boolean>
}): void {
  const { messagesLength, threadLoading, loadingOlder, messagesScrollRef, messengerPinnedToBottomRef } = opts
  const prevMessagesLenForScrollRef = useRef(0)

  useEffect(() => {
    if (loadingOlder || threadLoading) {
      prevMessagesLenForScrollRef.current = messagesLength
      return
    }
    const el = messagesScrollRef.current
    const prevLen = prevMessagesLenForScrollRef.current
    const grew = messagesLength > prevLen
    prevMessagesLenForScrollRef.current = messagesLength
    if (!el || !grew) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < MESSENGER_BOTTOM_PIN_PX
    if (nearBottom) {
      el.scrollTop = el.scrollHeight
      messengerPinnedToBottomRef.current = true
    }
  }, [messagesLength, threadLoading, loadingOlder])
}
