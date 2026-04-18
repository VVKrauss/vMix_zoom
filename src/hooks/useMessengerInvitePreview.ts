import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { resolveConversationByInvite, type InviteConversationPreview } from '../lib/groups'
import type { MessengerConversationSummary } from '../lib/messengerConversations'

/**
 * Превью по invite-токену из URL и нормализация в `?chat=id`, когда чат уже есть в списке (мобильная гонка).
 */
export function useMessengerInvitePreview(opts: {
  inviteToken: string
  userId: string | undefined
  items: MessengerConversationSummary[]
  navigate: NavigateFunction
}): {
  invitePreview: InviteConversationPreview | null
  inviteLoading: boolean
  inviteError: string | null
  setInviteError: Dispatch<SetStateAction<string | null>>
} {
  const { inviteToken, userId, items, navigate } = opts
  const [invitePreview, setInvitePreview] = useState<InviteConversationPreview | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!userId) {
      setInvitePreview(null)
      setInviteError(null)
      setInviteLoading(false)
      return
    }
    const token = inviteToken.trim()
    if (!token) {
      setInvitePreview(null)
      setInviteError(null)
      setInviteLoading(false)
      return
    }
    setInviteLoading(true)
    setInviteError(null)
    void resolveConversationByInvite(token).then((res) => {
      if (!active) return
      setInviteLoading(false)
      if (res.error) {
        setInvitePreview(null)
        setInviteError(res.error)
        return
      }
      setInvitePreview(res.data)
    })
    return () => {
      active = false
    }
  }, [inviteToken, userId])

  useEffect(() => {
    const cid = invitePreview?.id?.trim()
    const token = inviteToken.trim()
    if (!token || !cid) return
    if (items.some((i) => i.id === cid)) {
      navigate(`/dashboard/messenger?chat=${encodeURIComponent(cid)}`, { replace: true })
    }
  }, [invitePreview?.id, inviteToken, items, navigate])

  return { invitePreview, inviteLoading, inviteError, setInviteError }
}
