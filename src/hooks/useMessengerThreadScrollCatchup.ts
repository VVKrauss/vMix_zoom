import { useEffect, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { MESSENGER_BOTTOM_PIN_PX } from '../lib/messengerDashboardUtils'
import { attachMessengerTailCatchupAfterContentPaint } from './messengerTailCatchup'

/** После окончания `threadLoading` — прокрутка вниз, если есть сообщения. */
export function useMessengerScrollAfterThreadLoad(opts: {
  threadLoading: boolean
  listOnlyMobile: boolean
  messagesLength: number
  messagesScrollRef: RefObject<HTMLDivElement | null>
  messagesContentRef: RefObject<HTMLDivElement | null>
  conversationIdRef: RefObject<string>
  activeConversationId: string
  messengerPinnedToBottomRef: MutableRefObject<boolean>
}): void {
  const {
    threadLoading,
    listOnlyMobile,
    messagesLength,
    messagesScrollRef,
    messagesContentRef,
    conversationIdRef,
    activeConversationId,
    messengerPinnedToBottomRef,
  } = opts
  const prevThreadLoadingRef = useRef(false)
  const cancelTailCatchupRef = useRef<(() => void) | null>(null)
  /** Не кладём `messagesLength` в deps эффекта — иначе на каждое сообщение cleanup срывает tail-catchup по картинкам. */
  const messagesLengthRef = useRef(messagesLength)
  messagesLengthRef.current = messagesLength

  useLayoutEffect(() => {
    cancelTailCatchupRef.current?.()
    cancelTailCatchupRef.current = null

    const wasLoading = prevThreadLoadingRef.current
    prevThreadLoadingRef.current = threadLoading
    const len = messagesLengthRef.current
    if (wasLoading && !threadLoading && !listOnlyMobile && len > 0) {
      const scrollEl = messagesScrollRef.current
      const contentEl = messagesContentRef.current
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight
        messengerPinnedToBottomRef.current = true
      }
      if (scrollEl && contentEl) {
        const openedId = activeConversationId.trim()
        cancelTailCatchupRef.current = attachMessengerTailCatchupAfterContentPaint({
          scrollEl,
          contentEl,
          pinRef: messengerPinnedToBottomRef,
          isActive: () => (conversationIdRef.current ?? '').trim() === openedId,
        })
      }
    }
    return () => {
      cancelTailCatchupRef.current?.()
      cancelTailCatchupRef.current = null
    }
  }, [
    threadLoading,
    listOnlyMobile,
    messagesScrollRef,
    messagesContentRef,
    conversationIdRef,
    activeConversationId,
    messengerPinnedToBottomRef,
  ])
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
    const stickToTail = messengerPinnedToBottomRef.current || nearBottom
    if (stickToTail) {
      el.scrollTop = el.scrollHeight
      messengerPinnedToBottomRef.current = true
    }
  }, [messagesLength, threadLoading, loadingOlder])
}
