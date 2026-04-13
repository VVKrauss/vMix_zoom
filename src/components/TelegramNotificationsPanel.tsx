import { useEffect, useState } from 'react'
import {
  fetchTelegramNotifications,
  sendTelegramNotificationsTest,
  updateTelegramNotifications,
} from '../api/telegramNotificationsApi'
import type {
  TelegramEventType,
  TelegramNotificationsPayload,
  TelegramNotificationsResponse,
} from '../types/telegramAdminSettings'
import { hasAdminBearerToken } from '../utils/adminApiAuth'
import { PillToggle } from './PillToggle'

const ROOM_DEBUG_EVENT: TelegramEventType = 'room_debug'

const EVENT_OPTIONS: { key: TelegramEventType; label: string }[] = [
  { key: 'room_created', label: 'Новые комнаты' },
  { key: 'participant_joined', label: 'Новые пользователи' },
  { key: 'participant_left', label: 'Выходы пользователей' },
  { key: 'room_closed', label: 'Закрытие комнат' },
  { key: 'egress_started', label: 'Старт внешнего потока' },
  { key: 'egress_stopped', label: 'Остановка внешнего потока' },
]

type TelegramToggleState = {
  enabled: boolean
  immediateEvents: TelegramEventType[]
  summary4h: boolean
  summary8h: boolean
  summary24h: boolean
}

function settingsToToggleState(data: TelegramNotificationsResponse): TelegramToggleState {
  return {
    enabled: data.enabled,
    immediateEvents: [...data.immediateEvents],
    summary4h: data.summaryHours === 4,
    summary8h: data.summaryHours === 8,
    summary24h: data.summaryHours === 24,
  }
}

function toggleStateToPayload(state: TelegramToggleState): TelegramNotificationsPayload {
  let summaryHours = 0
  if (state.summary4h) summaryHours = 4
  else if (state.summary8h) summaryHours = 8
  else if (state.summary24h) summaryHours = 24
  return {
    enabled: state.enabled,
    immediateEvents: [...state.immediateEvents],
    summaryHours,
  }
}

function hasMultipleSummaryToggles(state: TelegramToggleState): boolean {
  return Number(state.summary4h) + Number(state.summary8h) + Number(state.summary24h) > 1
}

export function TelegramNotificationsPanel() {
  const [settings, setSettings] = useState<TelegramToggleState>({
    enabled: true,
    immediateEvents: [],
    summary4h: false,
    summary8h: false,
    summary24h: false,
  })
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
      setSettings(settingsToToggleState(result.data))
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
    const result = await updateTelegramNotifications(toggleStateToPayload(settings))
    setTelegramSaving(false)
    if (!result.ok) {
      setTelegramSaveErr(result.message)
      return
    }
    setTelegramConfigured(result.data.configured)
    setSettings(settingsToToggleState(result.data))
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
        Включаем нужные события отдельно. Тестовое сообщение уже работает через тот же бот.
      </p>
      {!canManageTelegram ? (
        <p className="join-error">
          Добавьте <code>VITE_ADMIN_API_SECRET</code>, чтобы управлять уведомлениями из админки.
        </p>
      ) : (
        <form onSubmit={handleSaveTelegramPrefs} className="dashboard-form">
          <div className="dashboard-field">
            <div className="dashboard-field__inline dashboard-field__inline--toggle">
              <span className="dashboard-field__label">Уведомления включены</span>
              <PillToggle
                checked={settings.enabled}
                onCheckedChange={(next) => {
                  setSettings((prev) => ({ ...prev, enabled: next }))
                  setTelegramSaveMsg(null)
                  setTelegramSaveErr(null)
                }}
                offLabel="Нет"
                onLabel="Да"
                ariaLabel="Включить Telegram уведомления"
              />
            </div>
          </div>

          {EVENT_OPTIONS.map((option) => {
            const checked = settings.immediateEvents.includes(option.key)
            return (
              <div className="dashboard-field" key={option.key}>
                <div className="dashboard-field__inline dashboard-field__inline--toggle">
                  <span className="dashboard-field__label">{option.label}</span>
                  <PillToggle
                    checked={checked}
                    onCheckedChange={(next) => {
                      setSettings((prev) => ({
                        ...prev,
                        immediateEvents: next
                          ? Array.from(new Set([...prev.immediateEvents, option.key]))
                          : prev.immediateEvents.filter((item) => item !== option.key),
                      }))
                      setTelegramSaveMsg(null)
                      setTelegramSaveErr(null)
                    }}
                    offLabel="Выкл"
                    onLabel="Вкл"
                    ariaLabel={option.label}
                  />
                </div>
              </div>
            )
          })}

          <div className="dashboard-field">
            <div className="dashboard-field__inline dashboard-field__inline--toggle">
              <span className="dashboard-field__label">Отладка жизни комнаты</span>
              <PillToggle
                checked={settings.immediateEvents.includes(ROOM_DEBUG_EVENT)}
                onCheckedChange={(next) => {
                  setSettings((prev) => ({
                    ...prev,
                    immediateEvents: next
                      ? Array.from(new Set([...prev.immediateEvents, ROOM_DEBUG_EVENT]))
                      : prev.immediateEvents.filter((item) => item !== ROOM_DEBUG_EVENT),
                  }))
                  setTelegramSaveMsg(null)
                  setTelegramSaveErr(null)
                }}
                offLabel="Выкл"
                onLabel="Вкл"
                ariaLabel="Отладка жизни комнаты"
              />
            </div>
          </div>

          <div className="dashboard-field">
            <div className="dashboard-field__inline dashboard-field__inline--toggle">
              <span className="dashboard-field__label">Сводка за 4 часа</span>
              <PillToggle
                checked={settings.summary4h}
                onCheckedChange={(next) => {
                  setSettings((prev) => ({ ...prev, summary4h: next }))
                  setTelegramSaveMsg(null)
                  setTelegramSaveErr(null)
                }}
                offLabel="Выкл"
                onLabel="Вкл"
                ariaLabel="Сводка за 4 часа"
              />
            </div>
          </div>
          <div className="dashboard-field">
            <div className="dashboard-field__inline dashboard-field__inline--toggle">
              <span className="dashboard-field__label">Сводка за 8 часов</span>
              <PillToggle
                checked={settings.summary8h}
                onCheckedChange={(next) => {
                  setSettings((prev) => ({ ...prev, summary8h: next }))
                  setTelegramSaveMsg(null)
                  setTelegramSaveErr(null)
                }}
                offLabel="Выкл"
                onLabel="Вкл"
                ariaLabel="Сводка за 8 часов"
              />
            </div>
          </div>
          <div className="dashboard-field">
            <div className="dashboard-field__inline dashboard-field__inline--toggle">
              <span className="dashboard-field__label">Сводка за день</span>
              <PillToggle
                checked={settings.summary24h}
                onCheckedChange={(next) => {
                  setSettings((prev) => ({ ...prev, summary24h: next }))
                  setTelegramSaveMsg(null)
                  setTelegramSaveErr(null)
                }}
                offLabel="Выкл"
                onLabel="Вкл"
                ariaLabel="Сводка за день"
              />
            </div>
          </div>

          <div className="dashboard-field">
            <div className="dashboard-field__inline">
              <span className="dashboard-field__label">Состояние бота</span>
              <span
                className={`dashboard-badge ${
                  telegramConfigured ? 'dashboard-badge--active' : 'dashboard-badge--pending'
                }`}
              >
                {telegramConfigured ? 'Подключён' : 'Не настроен на сервере'}
              </span>
            </div>
          </div>

          {hasMultipleSummaryToggles(settings) ? (
            <p className="dashboard-section__hint">
              На текущем бэке сохраняется только один интервал сводки. Если включено несколько, будет
              использован первый: 4ч, потом 8ч, потом 24ч.
            </p>
          ) : null}

          {telegramSaveErr && <p className="join-error">{telegramSaveErr}</p>}
          {telegramSaveMsg && <p className="dashboard-save-ok">{telegramSaveMsg}</p>}

          <div className="dashboard-field">
            <div className="dashboard-field__inline">
              <button
                type="submit"
                className="join-btn dashboard-form__save"
                disabled={telegramLoading || telegramSaving}
              >
                {telegramSaving ? 'Сохранение…' : 'Сохранить настройки Telegram'}
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
