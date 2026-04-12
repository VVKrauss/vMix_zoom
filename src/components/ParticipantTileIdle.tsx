import { useUserPeek } from '../context/UserPeekContext'
import { initialsFromDisplayName } from '../utils/participantInitials'

interface Props {
  name: string
  avatarUrl?: string | null
  /** Если задан — по тапу открывается карточка пользователя. */
  peekUserId?: string | null
}

/** Заглушка без видео: аватар или инициалы в круге (единый вид для локальной и удалённых плиток). */
export function ParticipantTileIdle({ name, avatarUrl, peekUserId }: Props) {
  const { openUserPeek } = useUserPeek()
  const initials = initialsFromDisplayName(name)
  const uid = peekUserId?.trim() ?? ''
  const body = (
    <div className="participant-tile-idle__ring" aria-hidden>
      {avatarUrl ? (
        <img className="participant-tile-idle__img" src={avatarUrl} alt="" draggable={false} />
      ) : (
        <span className="participant-tile-idle__initials">{initials}</span>
      )}
    </div>
  )

  if (uid) {
    return (
      <button
        type="button"
        className="participant-tile-idle participant-tile-idle--peek"
        aria-label={`Профиль: ${name}`}
        onClick={() => openUserPeek({ userId: uid, displayName: name, avatarUrl })}
      >
        {body}
      </button>
    )
  }

  return <div className="participant-tile-idle">{body}</div>
}
