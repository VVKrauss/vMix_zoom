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
  /**
   * На практике `threadLoading` может упасть в `false` до того как сообщения реально появятся в DOM
   * (разные batched setState / кэш / сетевой ответ). Поэтому держим pending-флаг: прокрутим вниз
   * при первом удобном моменте, когда `len > 0` и поток не грузится.
   */
  const pendingTailScrollRef = useRef(false)
  const prevActiveConversationIdRef = useRef('')
  const raf0Ref = useRef<number | null>(null)
  const raf1Ref = useRef<number | null>(null)
  /** Не кладём `messagesLength` в deps эффекта — иначе на каждое сообщение cleanup срывает tail-catchup по картинкам. */
  const messagesLengthRef = useRef(messagesLength)
  messagesLengthRef.current = messagesLength

  useLayoutEffect(() => {
    cancelTailCatchupRef.current?.()
    cancelTailCatchupRef.current = null
    if (raf0Ref.current) cancelAnimationFrame(raf0Ref.current)
    if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current)
    raf0Ref.current = null
    raf1Ref.current = null

    const wasLoading = prevThreadLoadingRef.current
    prevThreadLoadingRef.current = threadLoading
    const len = messagesLengthRef.current

    const openedId = activeConversationId.trim()
    const prevOpenedId = prevActiveConversationIdRef.current
    prevActiveConversationIdRef.current = openedId
    if (openedId && openedId !== prevOpenedId) pendingTailScrollRef.current = true
    if (threadLoading) pendingTailScrollRef.current = true

    if (listOnlyMobile || threadLoading || len <= 0) {
      return () => {
        cancelTailCatchupRef.current?.()
        cancelTailCatchupRef.current = null
        if (raf0Ref.current) cancelAnimationFrame(raf0Ref.current)
        if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current)
        raf0Ref.current = null
        raf1Ref.current = null
      }
    }

    if (!pendingTailScrollRef.current && !wasLoading) {
      return () => {
        cancelTailCatchupRef.current?.()
        cancelTailCatchupRef.current = null
        if (raf0Ref.current) cancelAnimationFrame(raf0Ref.current)
        if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current)
        raf0Ref.current = null
        raf1Ref.current = null
      }
    }

    const applyTailScroll = () => {
      const scrollEl = messagesScrollRef.current
      if (!scrollEl) return false
      pendingTailScrollRef.current = false
      scrollEl.scrollTop = scrollEl.scrollHeight
      messengerPinnedToBottomRef.current = true

      const contentEl = messagesContentRef.current
      if (contentEl) {
        cancelTailCatchupRef.current = attachMessengerTailCatchupAfterContentPaint({
          scrollEl,
          contentEl,
          pinRef: messengerPinnedToBottomRef,
          isActive: () => (conversationIdRef.current ?? '').trim() === openedId,
        })
      }
      return true
    }

    // Если ref ещё не проставился (редко, но на переходах/мобилке бывает) — попробуем после paint.
    if (!messagesScrollRef.current) {
      raf0Ref.current = requestAnimationFrame(() => {
        raf1Ref.current = requestAnimationFrame(() => {
          if (!pendingTailScrollRef.current) return
          if ((activeConversationId ?? '').trim() !== openedId) return
          if (!applyTailScroll()) pendingTailScrollRef.current = false
        })
      })
    } else {
      applyTailScroll()
    }

    return () => {
      cancelTailCatchupRef.current?.()
      cancelTailCatchupRef.current = null
      if (raf0Ref.current) cancelAnimationFrame(raf0Ref.current)
      if (raf1Ref.current) cancelAnimationFrame(raf1Ref.current)
      raf0Ref.current = null
      raf1Ref.current = null
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
      const delta = Math.max(0, messagesLength - prevLen)
      // Плавно только для "обычного" прихода одного сообщения, чтобы не трясло ленту на bulk-обновлениях.
      if (delta === 1) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
      messengerPinnedToBottomRef.current = true
    }
  }, [messagesLength, threadLoading, loadingOlder])
}
