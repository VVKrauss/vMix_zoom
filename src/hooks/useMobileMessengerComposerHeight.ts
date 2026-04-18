import { useCallback, useLayoutEffect, type RefObject } from 'react'

/**
 * На мобилке подстраивает высоту textarea под содержимое (и сбрасывает на десктопе).
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
    if (!ta || !isMobileMessenger) return
    const vv = window.visualViewport
    const vh = vv?.height ?? window.innerHeight
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, Math.round(vh * 0.28))}px`
  }, [composerTextareaRef, isMobileMessenger])

  useLayoutEffect(() => {
    if (!isMobileMessenger) {
      const ta = composerTextareaRef.current
      if (ta) ta.style.height = ''
      return
    }
    adjustMobileComposerHeight()
  }, [draft, activeConversationId, editingMessageId, isMobileMessenger, adjustMobileComposerHeight, threadLoading])

  return { adjustMobileComposerHeight }
}
