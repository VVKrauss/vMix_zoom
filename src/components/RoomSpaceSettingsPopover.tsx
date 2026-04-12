import { useEffect, useRef } from 'react'
import { PillToggle } from './PillToggle'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import type { SpaceRoomChatVisibility } from '../lib/spaceRoom'
import { SPACE_ROOM_CHAT_POLICY_SELECT_OPTIONS } from '../lib/spaceRoom'
import type { SpaceRoomAccessMode } from '../hooks/useSpaceRoomSettings'

export function RoomSpaceSettingsPopover({
  showInfo,
  onToggleInfo,
  roomChatVisibility,
  onRoomChatVisibilityChange,
  canEditPolicies,
  roomAccessMode,
  onRoomAccessModeChange,
  onClose,
  embedded = false,
}: {
  showInfo: boolean
  onToggleInfo: () => void
  roomChatVisibility: SpaceRoomChatVisibility
  onRoomChatVisibilityChange: (v: SpaceRoomChatVisibility) => void
  canEditPolicies: boolean
  roomAccessMode: SpaceRoomAccessMode
  onRoomAccessModeChange: (v: SpaceRoomAccessMode) => void
  onClose: () => void
  /** В листе на мобильных — без закрытия по клику снаружи (есть подложка). */
  embedded?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (embedded) return
    let active = false
    const activateId = window.setTimeout(() => {
      active = true
    }, 0)
    const handler = (e: MouseEvent | PointerEvent) => {
      if (!active) return
      if (shouldClosePopoverOnOutsidePointer(ref.current, e.target)) onClose()
    }
    document.addEventListener('click', handler)
    return () => {
      window.clearTimeout(activateId)
      document.removeEventListener('click', handler)
    }
  }, [embedded, onClose])

  return (
    <div className="settings-popover room-space-settings-popover" ref={ref}>
      <div className="settings-popover__title">Настройки комнаты</div>

      <div className="settings-row settings-row--pill">
        <span className="settings-label">Инфо на видео</span>
        <PillToggle
          compact
          checked={showInfo}
          onCheckedChange={() => onToggleInfo()}
          ariaLabel="Информация на видео"
        />
      </div>

      {canEditPolicies ? (
        <>
          <div className="settings-popover__section settings-popover__section--bordered">
            <span className="device-popover__label">Кто может пользоваться чатом</span>
            <select
              className="settings-select device-popover__select-full"
              value={roomChatVisibility}
              onChange={(e) => {
                onRoomChatVisibilityChange(e.target.value as SpaceRoomChatVisibility)
              }}
              aria-label="Политика чата для всех участников"
            >
              {SPACE_ROOM_CHAT_POLICY_SELECT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-popover__section settings-popover__section--bordered">
            <div className="settings-popover__subtitle">Вход в комнату</div>
            <div className="settings-row settings-row--pill">
              <span className="settings-label">Одобрять вход вручную</span>
              <PillToggle
                compact
                checked={roomAccessMode === 'approval'}
                onCheckedChange={(checked) => onRoomAccessModeChange(checked ? 'approval' : 'link')}
                ariaLabel="Требовать одобрения для входа в комнату"
              />
            </div>
            {roomAccessMode === 'approval' ? (
              <p className="settings-popover__hint">
                Гости увидят экран ожидания, вы — запросы на вход (в шапке комнаты).
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="settings-popover__hint">Изменять политику чата и входа может только хост, персонал или со-админ комнаты.</p>
      )}
    </div>
  )
}
