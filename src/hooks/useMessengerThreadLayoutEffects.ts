import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { MESSENGER_LAST_OPEN_KEY } from '../lib/messengerDashboardUtils'

type PendingPhoto = { id: string; file: File; previewUrl: string }

/** Смена треда — отзываем object URL у черновых вложений. */
export function useMessengerPendingPhotosReset(
  activeConversationId: string,
  setPendingMessengerPhotos: Dispatch<SetStateAction<PendingPhoto[]>>,
): void {
  useEffect(() => {
    setPendingMessengerPhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl)
      return []
    })
  }, [activeConversationId])
}

/** Новый диалог — считаем, что пользователь у низа ленты. */
export function useMessengerPinnedBottomReset(
  activeConversationId: string,
  listOnlyMobile: boolean,
  messengerPinnedToBottomRef: MutableRefObject<boolean>,
): void {
  useEffect(() => {
    messengerPinnedToBottomRef.current = true
  }, [activeConversationId, listOnlyMobile])
}

/** Запоминаем последний открытый чат для восстановления при следующем заходе. */
export function useMessengerLastOpenPersist(
  activeConversationId: string,
  listOnlyMobile: boolean,
): void {
  useEffect(() => {
    if (listOnlyMobile || !activeConversationId) return
    try {
      localStorage.setItem(MESSENGER_LAST_OPEN_KEY, activeConversationId)
    } catch {
      /* ignore */
    }
  }, [activeConversationId, listOnlyMobile])
}

/**
 * Рост высоты ленты без нового сообщения (decode картинок и т.д.) —
 * догоняем низ, если пользователь был у хвоста.
 */
export function useMessengerResizeScrollTailCatchup(opts: {
  activeConversationId: string
  listOnlyMobile: boolean
  threadLoading: boolean
  messagesContentRef: RefObject<HTMLDivElement | null>
  messagesScrollRef: RefObject<HTMLDivElement | null>
  messengerPinnedToBottomRef: MutableRefObject<boolean>
}): void {
  const {
    activeConversationId,
    listOnlyMobile,
    threadLoading,
    messagesContentRef,
    messagesScrollRef,
    messengerPinnedToBottomRef,
  } = opts

  useEffect(() => {
    if (listOnlyMobile || typeof ResizeObserver === 'undefined') return
    const root = messagesContentRef.current
    if (!root || threadLoading) return

    const ro = new ResizeObserver(() => {
      if (!messengerPinnedToBottomRef.current) return
      const el = messagesScrollRef.current
      if (!el) return
      requestAnimationFrame(() => {
        if (!messengerPinnedToBottomRef.current) return
        el.scrollTop = el.scrollHeight
      })
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [activeConversationId, listOnlyMobile, threadLoading])
}
