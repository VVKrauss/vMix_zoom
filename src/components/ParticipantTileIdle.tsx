import { initialsFromDisplayName } from '../utils/participantInitials'

interface Props {
  name: string
  avatarUrl?: string | null
}

/** Заглушка без видео: аватар или инициалы в круге (единый вид для локальной и удалённых плиток). */
export function ParticipantTileIdle({ name, avatarUrl }: Props) {
  const initials = initialsFromDisplayName(name)
  return (
    <div className="participant-tile-idle">
      <div className="participant-tile-idle__ring" aria-hidden>
        {avatarUrl ? (
          <img className="participant-tile-idle__img" src={avatarUrl} alt="" draggable={false} />
        ) : (
          <span className="participant-tile-idle__initials">{initials}</span>
        )}
      </div>
    </div>
  )
}
