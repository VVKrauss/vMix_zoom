import { supabase } from '../lib/supabase'

interface Props {
  roomId: string
  onTakeover: () => void
  onJoinAsParticipant: () => void
}

/**
 * Показывается хосту комнаты, который открыл её с нового устройства/вкладки,
 * где нет sessionStorage-отметки хоста. Предлагает взять управление или войти
 * как обычный участник.
 *
 * При «Взять управление» отправляет broadcast-сигнал старому устройству,
 * чтобы оно потеряло флаги хоста в UI.
 */
export function RoomHostClaimModal({ roomId, onTakeover, onJoinAsParticipant }: Props) {
  const handleTakeover = () => {
    // Сигнал предыдущему устройству через Supabase Realtime Broadcast
    const ch = supabase.channel(`room-mod:${roomId.trim()}`)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void ch
          .send({
            type: 'broadcast',
            event: 'host-transfer-claimed',
            payload: { claimedAt: new Date().toISOString() },
          })
          .then(() => {
            void supabase.removeChannel(ch)
          })
      }
    })
    onTakeover()
  }

  return (
    <div className="room-host-claim-backdrop">
      <div className="room-host-claim-modal">
        <div className="room-host-claim-modal__icon" aria-hidden>
          📡
        </div>
        <h2 className="room-host-claim-modal__title">Вы уже ведёте эту комнату</h2>
        <p className="room-host-claim-modal__body">
          Управление этой комнатой открыто на другом устройстве или вкладке.
          Хотите перенести его сюда?
        </p>
        <div className="room-host-claim-modal__actions">
          <button
            type="button"
            className="join-btn join-btn--block room-host-claim-modal__btn-primary"
            onClick={handleTakeover}
          >
            Взять управление здесь
          </button>
          <button
            type="button"
            className="join-btn join-btn--secondary join-btn--block room-host-claim-modal__btn-secondary"
            onClick={onJoinAsParticipant}
          >
            Войти без управления
          </button>
        </div>
        <p className="room-host-claim-modal__hint">
          ID комнаты: <span className="room-host-claim-modal__room-id">{roomId}</span>
        </p>
      </div>
    </div>
  )
}
