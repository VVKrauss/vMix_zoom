import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon } from '../icons'
import { getMessengerImageSignedUrl } from '../../lib/messenger'
import { resolveConversationByInvite, type InviteConversationPreview } from '../../lib/groups'
import { conversationInitial } from '../../lib/messengerDashboardUtils'

type Props = { inviteToken: string }

export function MessengerInlineInviteCard({ inviteToken }: Props) {
  const [preview, setPreview] = useState<InviteConversationPreview | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const to = `/dashboard/messenger?invite=${encodeURIComponent(inviteToken)}`

  useEffect(() => {
    let cancelled = false
    const token = inviteToken.trim()
    if (!token) {
      setLoading(false)
      return
    }

    setLoading(true)
    setPreview(null)
    setAvatarUrl(null)

    void (async () => {
      const res = await resolveConversationByInvite(token)
      if (cancelled) return
      if (res.error || !res.data) {
        setPreview(null)
        setAvatarUrl(null)
        setLoading(false)
        return
      }
      setPreview(res.data)
      const path = (res.data.avatarThumbPath?.trim() || res.data.avatarPath?.trim() || '').trim()
      if (!path) {
        setAvatarUrl(null)
        setLoading(false)
        return
      }
      const signed = await getMessengerImageSignedUrl(path, 3600)
      if (cancelled) return
      setAvatarUrl(signed.url ?? null)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [inviteToken])

  const titleText = (() => {
    if (preview?.title?.trim()) return preview.title.trim()
    if (loading) return '…'
    return 'Чат'
  })()

  const initialLetter = conversationInitial(preview?.title?.trim() || 'Ч')

  return (
    <Link to={to} className="messenger-inline-invite-card">
      <span className="messenger-inline-invite-card__avatar" aria-hidden>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" />
        ) : (
          <span className="messenger-inline-invite-card__avatar-fallback">{loading ? '…' : initialLetter}</span>
        )}
      </span>
      <span className="messenger-inline-invite-card__title">{titleText}</span>
      <span className="messenger-inline-invite-card__arrow" aria-hidden>
        <ChevronRightIcon />
      </span>
    </Link>
  )
}
