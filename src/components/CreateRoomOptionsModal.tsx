import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import type { SpaceRoomChatVisibility, SpaceRoomCreateOptions, SpaceRoomLifecycleKind } from '../lib/spaceRoom'
import { SPACE_ROOM_TEMPORARY_INVITE_MINUTES } from '../lib/spaceRoom'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (opts: SpaceRoomCreateOptions) => void
}

const CHAT_OPTIONS: { value: SpaceRoomChatVisibility; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Все участники', hint: 'Гости и зарегистрированные' },
  { value: 'authenticated_only', label: 'Только с аккаунтом', hint: 'Гости не видят чат' },
  { value: 'staff_only', label: 'Хост и админы', hint: 'Только организатор и персонал платформы' },
  { value: 'closed', label: 'Закрыт', hint: 'Сообщения видны, отправка отключена для всех' },
]

export function CreateRoomOptionsModal({ open, onClose, onConfirm }: Props) {
  const [lifecycle, setLifecycle] = useState<SpaceRoomLifecycleKind>('temporary')
  const [chatVisibility, setChatVisibility] = useState<SpaceRoomChatVisibility>('everyone')

  const handleConfirm = () => {
    onConfirm({ lifecycle, chatVisibility })
    onClose()
  }

  return (
    <ConfirmDialog
      open={open}
      title="Новая комната"
      message={
        <div className="create-room-options">
          <fieldset className="create-room-options__fieldset">
            <legend className="create-room-options__legend">Тип комнаты</legend>
            <label className="create-room-options__radio">
              <input
                type="radio"
                name="room-lifecycle"
                checked={lifecycle === 'temporary'}
                onChange={() => setLifecycle('temporary')}
              />
              <span>
                Временная
                <span className="create-room-options__hint">
                  Около {SPACE_ROOM_TEMPORARY_INVITE_MINUTES} мин. после появления комнаты в базе вход по ссылке без
                  одобрения; затем режим «по ссылке без хоста» отключается (допуск хоста/админа — в следующих версиях).
                </span>
              </span>
            </label>
            <label className="create-room-options__radio">
              <input
                type="radio"
                name="room-lifecycle"
                checked={lifecycle === 'permanent'}
                onChange={() => setLifecycle('permanent')}
              />
              <span>
                Постоянная
                <span className="create-room-options__hint">
                  Комната остаётся в списке после выхода хоста; ссылка без ограничения по времени.
                </span>
              </span>
            </label>
          </fieldset>

          <div className="create-room-options__fieldset">
            <span className="create-room-options__legend">Чат при старте</span>
            <p className="create-room-options__note">Хост может изменить режим чата во время встречи.</p>
            <select
              className="create-room-options__select"
              value={chatVisibility}
              onChange={(e) => setChatVisibility(e.target.value as SpaceRoomChatVisibility)}
              aria-label="Режим чата при создании"
            >
              {CHAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} — {o.hint}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
      cancelLabel="Отмена"
      confirmLabel="Создать"
      onCancel={onClose}
      onConfirm={handleConfirm}
    />
  )
}
