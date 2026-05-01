import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiRrIcon } from '../icons'

export function MessengerInlineRoomInviteCard({ roomId }: { roomId: string }) {
  const id = roomId.trim()
  const to = useMemo(() => `/r/${encodeURIComponent(id)}`, [id])
  if (!id) return null

  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    const text = id
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1100)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        ta.style.top = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1100)
      } catch {
        // ignore
      }
    }
  }, [id])

  return (
    <span className="messenger-inline-room-invite-card" role="group" aria-label="Приглашение в комнату">
      <span className="messenger-inline-room-invite-card__top">
        <span className="messenger-inline-room-invite-card__avatar" aria-hidden>
          <FiRrIcon name="video-camera" />
        </span>
        <span className="messenger-inline-room-invite-card__title">
          Комната <span className="messenger-inline-room-invite-card__code">{id}</span>
        </span>
      </span>

      <span className="messenger-inline-room-invite-card__actions">
        <Link to={to} className="messenger-inline-room-invite-card__btn messenger-inline-room-invite-card__btn--primary">
          <span className="messenger-inline-room-invite-card__btn-ico" aria-hidden>
            <FiRrIcon name="enter" />
          </span>
          Открыть
        </Link>
        <button
          type="button"
          className="messenger-inline-room-invite-card__btn"
          onClick={() => void onCopy()}
          aria-label="Скопировать код"
          title="Скопировать код"
        >
          <span className="messenger-inline-room-invite-card__btn-ico" aria-hidden>
            <FiRrIcon name={copied ? 'check' : 'copy'} />
          </span>
          {copied ? 'Скопировано' : 'Код'}
        </button>
      </span>
    </span>
  )
}

