import { useCallback, useLayoutEffect, type RefObject } from 'react'

/**
 * Подстраивает высоту textarea композера под текст: одна строка по умолчанию, рост до лимита.
 * На десктопе и мобилке (лимит по высоте viewport разный).
 */
export function useMobileMessengerComposerHeight(opts: {
  isMobileMessenger: boolean
  draft: string
  activeConversationId: string
  editingMessageId: string | null
  threadLoading: boolean
  composerTextareaRef: RefObject<HTMLTextAreaElement | null>
}): { adjustMobileComposerHeight: () => void } {
  const { isMobileMessenger, draft, activeConversationId, editingMessageId, threadLoading, composerTextareaRef } =
    opts

  const adjustMobileComposerHeight = useCallback(() => {
    const ta = composerTextareaRef.current
    if (!ta) return
    const vv = window.visualViewport
    const vh = vv?.height ?? window.innerHeight
    const maxH = isMobileMessenger ? Math.round(vh * 0.28) : Math.min(260, Math.round(vh * 0.32))
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`
  }, [composerTextareaRef, isMobileMessenger])

  useLayoutEffect(() => {
    adjustMobileComposerHeight()
  }, [draft, activeConversationId, editingMessageId, isMobileMessenger, adjustMobileComposerHeight, threadLoading])

  return { adjustMobileComposerHeight }
}
