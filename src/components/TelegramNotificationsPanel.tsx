import { useEffect, useState } from 'react'
import {
  fetchTelegramNotifications,
  sendTelegramNotificationsTest,
  updateTelegramNotifications,
} from '../api/telegramNotificationsApi'
import type {
  TelegramMode,
  TelegramNotificationsPayload,
  TelegramNotificationsResponse,
} from '../types/telegramAdminSettings'
import { hasAdminBearerToken } from '../utils/adminApiAuth'

function modeFromTelegramSettings(data: TelegramNotificationsResponse): TelegramMode {
  const events = [...data.immediateEvents].sort().join(',')
  if (data.summaryHours === 4 && data.immediateEvents.length === 0) return 'summary_4h'
  if (data.summaryHours === 8 && data.immediateEvents.length === 0) return 'summary_8h'
  if (data.summaryHours === 24 && data.immediateEvents.length === 0) return 'summary_24h'
  if (events === 'participant_joined') return 'new_users'
  if (events === 'room_created') return 'room_created'
  return 'all'
}

function telegramPayloadFromMode(mode: TelegramMode): TelegramNotificationsPayload {
  switch (mode) {
    case 'new_users':
      return { enabled: true, immediateEvents: ['participant_joined'], summaryHours: 0 }
    case 'room_created':
      return { enabled: true, immediateEvents: ['room_created'], summaryHours: 0 }
    case 'summary_4h':
      return { enabled: true, immediateEvents: [], summaryHours: 4 }
    case 'summary_8h':
      return { enabled: true, immediateEvents: [], summaryHours: 8 }
    case 'summary_24h':
      return { enabled: true, immediateEvents: [], summaryHours: 24 }
    case 'all':
    default:
      return {
        enabled: true,
        immediateEvents: [
          'room_created',
          'participant_joined',
          'participant_left',
          'room_closed',
          'egress_started',
          'egress_stopped',
        ],
        summaryHours: 0,
      }
  }
}

export function TelegramNotificationsPanel() {
  const [telegramMode, setTelegramMode] = useState<TelegramMode>('all')
  const [telegramConfigured, setTelegramConfigured] = useState(false)
  const [telegramLoading, setTelegramLoading] = useState(false)
  const [telegramSaving, setTelegramSaving] = useState(false)
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramSaveMsg, setTelegramSaveMsg] = useState<string | null>(null)
  const [telegramSaveErr, setTelegramSaveErr] = useState<string | null>(null)
  const canManageTelegram = hasAdminBearerToken()

  useEffect(() => {
    if (!canManageTelegram) return
    let cancelled = false
    setTelegramLoading(true)
    setTelegramSaveErr(null)
    void fetchTelegramNotifications().then((result) => {
      if (cancelled) return
      setTelegramLoading(false)
      if (!result.ok) {
        setTelegramSaveErr(result.message)
        return
      }
      setTelegramConfigured(result.data.configured)
      setTelegramMode(modeFromTelegramSettings(result.data))
    })
    return () => {
      cancelled = true
    }
  }, [canManageTelegram])

  const handleSaveTelegramPrefs = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManageTelegram) return
    setTelegramSaving(true)
    setTelegramSaveErr(null)
    setTelegramSaveMsg(null)
    const result = await updateTelegramNotifications(telegramPayloadFromMode(telegramMode))
    setTelegramSaving(false)
    if (!result.ok) {
      setTelegramSaveErr(result.message)
      return
    }
    setTelegramConfigured(result.data.configured)
    setTelegramMode(modeFromTelegramSettings(result.data))
    setTelegramSaveMsg('Настройки уведомлений сохранены')
  }

  const handleTelegramTest = async () => {
    if (!canManageTelegram) return
    setTelegramTesting(true)
    setTelegramSaveErr(null)
    setTelegramSaveMsg(null)
    const result = await sendTelegramNotificationsTest()
    setTelegramTesting(false)
    if (!result.ok) {
      setTelegramSaveErr(result.message)
      return
    }
    setTelegramSaveMsg('Тестовое сообщение отправлено')
  }

  return (
    <section className="dashboard-section">
      <h2 className="dashboard-section__subtitle">Telegram уведомления</h2>
      <p className="dashboard-section__hint">
        Настройка серверных событий для Telegram-бота и быстрый тест отправки.
      </p>
      {!canManageTelegram ? (
        <p className="join-error">
          Добавьте <code>VITE_ADMIN_API_SECRET</code>, чтобы управлять уведомлениями из админки.
        </p>
      ) : (
        <form onSubmit={handleSaveTelegramPrefs} className="dashboard-form">
          <div className="dashboard-field">
            <div className="dashboard-field__inline dashboard-field__inline--stripe">
              <span className="dashboard-field__label">Режим уведомлений</span>
              <select
                className="device-popover__select"
                value={telegramMode}
                onChange={(e) => {
                  setTelegramMode(e.target.value as TelegramMode)
                  setTelegramSaveMsg(null)
                  setTelegramSaveErr(null)
                }}
                disabled={telegramLoading || telegramSaving}
                aria-label="Режим Telegram уведомлений"
              >
                <option value="all">Показывать всё</option>
                <option value="new_users">Только новые пользователи</option>
                <option value="room_created">Только создание комнат</option>
                <option value="summary_4h">Сводка за 4 часа</option>
                <option value="summary_8h">Сводка за 8 часов</option>
                <option value="summary_24h">Сводка за день</option>
              </select>
            </div>
          </div>
          <div className="dashboard-field">
            <div className="dashboard-field__inline dashboard-field__inline--stripe">
              <span className="dashboard-field__label">Состояние бота</span>
              <span className={`dashboard-badge ${telegramConfigured ? 'dashboard-badge--active' : 'dashboard-badge--pending'}`}>
                {telegramConfigured ? 'Подключён' : 'Не настроен на сервере'}
              </span>
            </div>
          </div>
          {telegramSaveErr && <p className="join-error">{telegramSaveErr}</p>}
          {telegramSaveMsg && <p className="dashboard-save-ok">{telegramSaveMsg}</p>}
          <div className="dashboard-field">
            <div className="dashboard-field__inline">
              <button
                type="submit"
                className="join-btn dashboard-form__save"
                disabled={telegramLoading || telegramSaving}
              >
                {telegramSaving ? 'Сохранение…' : 'Сохранить Telegram режим'}
              </button>
              <button
                type="button"
                className="join-btn join-btn--secondary"
                onClick={() => {
                  void handleTelegramTest()
                }}
                disabled={telegramLoading || telegramTesting || !telegramConfigured}
              >
                {telegramTesting ? 'Отправка…' : 'Отправить тест'}
              </button>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}
