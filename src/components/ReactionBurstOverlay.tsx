import type { RoomReactionBurst } from '../types/roomComms'

/** Плавающая реакция в углу превью; `key={burst.id}` снаружи перезапускает анимацию. */
export function ReactionBurstOverlay({ burst }: { burst: RoomReactionBurst }) {
  return (
    <div className="reaction-burst" aria-hidden>
      {burst.emoji}
    </div>
  )
}
