import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { BellIcon, BellOffIcon, FiRrIcon } from '../icons'
import { PillToggle } from '../PillToggle'
import type { MessengerFontPreset } from '../../lib/messengerUi'

export type MessengerPushUi = 'absent' | 'unconfigured' | 'off' | 'on' | 'denied'

export type MessengerSettingsModalProps = {
  open: boolean
  onClose: () => void
  messengerFontPreset: MessengerFontPreset
  setMessengerFontPreset: (v: MessengerFontPreset) => void
  setMessengerFontPresetState: (v: MessengerFontPreset) => void
  soundEnabled: boolean
  setSoundEnabled: (v: boolean) => void
  setMessengerSoundEnabled: (v: boolean) => void
  pushUi: MessengerPushUi
  pushBusy: boolean
  onTogglePush: () => void
  /** Личный кабинет → настройки приватности («Видимость на сайте»). */
  onOpenVisibilitySettings?: () => void
}

export function MessengerSettingsModal({
  open,
  onClose,
  messengerFontPreset,
  setMessengerFontPreset,
  setMessengerFontPresetState,
  soundEnabled,
  setSoundEnabled,
  setMessengerSoundEnabled,
  pushUi,
  pushBusy,
  onTogglePush,
  onOpenVisibilitySettings,
}: MessengerSettingsModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="messenger-settings-modal-root" role="dialog" aria-modal="true" aria-labelledby="messenger-settings-title">
      <button type="button" className="messenger-settings-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="messenger-settings-modal app-scroll">
        <h2 id="messenger-settings-title" className="messenger-settings-modal__title">
          Настройки мессенджера
        </h2>
        <div className="messenger-settings-modal__section">
          <span className="messenger-settings-modal__label">Размер шрифта в чате</span>
          <div className="messenger-settings-modal__segment" role="group" aria-label="Размер шрифта">
            {(
              [
                { id: 's' as const, label: 'Мелкий' },
                { id: 'm' as const, label: 'Обычный' },
                { id: 'l' as const, label: 'Крупный' },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`messenger-settings-modal__segment-btn${
                  messengerFontPreset === id ? ' messenger-settings-modal__segment-btn--active' : ''
                }`}
                onClick={() => {
                  setMessengerFontPreset(id)
                  setMessengerFontPresetState(id)
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="messenger-settings-modal__section">
          <span className="messenger-settings-modal__label">Звук входящих</span>
          <button
            type="button"
            className={`messenger-settings-modal__row-btn${soundEnabled ? ' messenger-settings-modal__row-btn--on' : ''}`}
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              setMessengerSoundEnabled(next)
            }}
            aria-pressed={soundEnabled}
          >
            <span className="messenger-settings-modal__row-ico" aria-hidden>
              {soundEnabled ? <BellIcon /> : <BellOffIcon />}
            </span>
            {soundEnabled ? 'Включён — нажмите, чтобы выключить' : 'Выключен — нажмите, чтобы включить'}
          </button>
        </div>
        {pushUi !== 'absent' ? (
          <div className="messenger-settings-modal__section">
            <div className="messenger-settings-modal__push-row">
              <span className="messenger-settings-modal__label">Push-уведомления</span>
              <PillToggle
                compact
                checked={pushUi === 'on'}
                onCheckedChange={() => void onTogglePush()}
                offLabel="Выкл"
                onLabel="Вкл"
                ariaLabel="Push-уведомления о личных сообщениях"
                disabled={pushBusy || pushUi === 'unconfigured' || pushUi === 'denied'}
              />
            </div>
            {pushUi === 'unconfigured' ? (
              <p className="messenger-settings-modal__hint">Нет ключа в сборке — пересоберите с VITE_VAPID_PUBLIC_KEY</p>
            ) : null}
            {pushUi === 'denied' ? (
              <p className="messenger-settings-modal__hint">Разрешите уведомления в настройках браузера.</p>
            ) : null}
          </div>
        ) : null}
        {onOpenVisibilitySettings ? (
          <div className="messenger-settings-modal__section">
            <button
              type="button"
              className="messenger-settings-modal__row-btn"
              onClick={() => {
                onClose()
                onOpenVisibilitySettings()
              }}
            >
              <span className="messenger-settings-modal__row-ico" aria-hidden>
                <FiRrIcon name="eye" />
              </span>
              Видимость на сайте
            </button>
            <p className="messenger-settings-modal__hint">Кто видит карточку, активность и статус «в сети»</p>
          </div>
        ) : null}
        <div className="messenger-settings-modal__actions">
          <button type="button" className="messenger-settings-modal__done" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
