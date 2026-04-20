import { useCallback, useEffect, useState } from 'react'
import { clearMessengerDraftText, getMessengerDraftText, setMessengerDraftText } from '../lib/messengerDraftStore'

/**
 * Текст композера, привязанный к `conversationId`: при смене чата подставляется свой черновик.
 */
export function useMessengerPerConversationDraft(conversationId: string) {
  const cid = conversationId.trim()
  const [draft, setDraftState] = useState(() => (cid ? getMessengerDraftText(cid) : ''))

  useEffect(() => {
    setDraftState(cid ? getMessengerDraftText(cid) : '')
  }, [cid])

  const setDraft = useCallback(
    (value: string | ((prev: string) => string)) => {
      setDraftState((prev) => {
        const next = typeof value === 'function' ? (value as (p: string) => string)(prev) : value
        if (cid) setMessengerDraftText(cid, next)
        return next
      })
    },
    [cid],
  )

  const resetDraft = useCallback(() => {
    setDraftState('')
    if (cid) clearMessengerDraftText(cid)
  }, [cid])

  return { draft, setDraft, resetDraft }
}
