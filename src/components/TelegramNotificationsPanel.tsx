import { useEffect, useRef, useState } from 'react'
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
  const autosaveSkipRef = useRef(true)
  const lastSavedRef = useRef<TelegramToggleState | null>(null)

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
      const next = settingsToToggleState(result.data)
      autosaveSkipRef.current = true
      lastSavedRef.current = next
      setSettings(next)
      queueMicrotask(() => {
        autosaveSkipRef.current = false
      })
    })
    return () => {
      cancelled = true
    }
  }, [canManageTelegram])

  useEffect(() => {
    if (!canManageTelegram) return
    if (telegramLoading) return
    if (autosaveSkipRef.current) return

    const prevSaved = lastSavedRef.current
    if (prevSaved && JSON.stringify(prevSaved) === JSON.stringify(settings)) return

    const t = window.setTimeout(() => {
      void (async () => {
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
        const saved = settingsToToggleState(result.data)
        lastSavedRef.current = saved
        autosaveSkipRef.current = true
        setSettings(saved)
        queueMicrotask(() => {
          autosaveSkipRef.current = false
        })
        setTelegramSaveMsg('Настройки уведомлений сохранены')
      })()
    }, 450)

    return () => window.clearTimeout(t)
  }, [canManageTelegram, telegramLoading, settings])

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

  const ToggleRow = ({
    label,
    checked,
    onChange,
    ariaLabel,
    offLabel = 'Выкл',
    onLabel = 'Вкл',
  }: {
    label: string
    checked: boolean
    onChange: (next: boolean) => void
    ariaLabel: string
    offLabel?: string
    onLabel?: string
  }) => (
    <div className="dashboard-settings-control-row">
      <span className="dashboard-settings-control-row__label">{label}</span>
      <div className="dashboard-settings-control-row__control">
        <PillToggle checked={checked} onCheckedChange={onChange} ariaLabel={ariaLabel} offLabel={offLabel} onLabel={onLabel} />
      </div>
    </div>
  )

  return (
    <section className="dashboard-tile">
      <h2 className="dashboard-tile__title">Telegram уведомления</h2>
      <p className="dashboard-field__hint" style={{ marginTop: 0 }}>
        Включайте нужные события отдельно. Тестовое сообщение отправляется через того же бота.
      </p>
      {!canManageTelegram ? (
        <p className="join-error">
          Добавьте <code>VITE_ADMIN_API_SECRET</code>, чтобы управлять уведомлениями из админки.
        </p>
      ) : (
        <div className="dashboard-form dashboard-form--compact">
          <ToggleRow
            label="Уведомления включены"
            checked={settings.enabled}
            onChange={(next) => {
              setSettings((prev) => ({ ...prev, enabled: next }))
              setTelegramSaveMsg(null)
              setTelegramSaveErr(null)
            }}
            ariaLabel="Включить Telegram уведомления"
            offLabel="Нет"
            onLabel="Да"
          />

          <p className="dashboard-settings-group-title">События (сразу)</p>

          {EVENT_OPTIONS.map((option) => {
            const checked = settings.immediateEvents.includes(option.key)
            return (
              <ToggleRow
                key={option.key}
                label={option.label}
                checked={checked}
                onChange={(next) => {
                  setSettings((prev) => ({
                    ...prev,
                    immediateEvents: next
                      ? Array.from(new Set([...prev.immediateEvents, option.key]))
                      : prev.immediateEvents.filter((item) => item !== option.key),
                  }))
                  setTelegramSaveMsg(null)
                  setTelegramSaveErr(null)
                }}
                ariaLabel={option.label}
              />
            )
          })}

          <ToggleRow
            label="Отладка жизни комнаты"
            checked={settings.immediateEvents.includes(ROOM_DEBUG_EVENT)}
            onChange={(next) => {
              setSettings((prev) => ({
                ...prev,
                immediateEvents: next
                  ? Array.from(new Set([...prev.immediateEvents, ROOM_DEBUG_EVENT]))
                  : prev.immediateEvents.filter((item) => item !== ROOM_DEBUG_EVENT),
              }))
              setTelegramSaveMsg(null)
              setTelegramSaveErr(null)
            }}
            ariaLabel="Отладка жизни комнаты"
          />

          <p className="dashboard-settings-group-title">Сводка</p>

          <ToggleRow
            label="Сводка за 4 часа"
            checked={settings.summary4h}
            onChange={(next) => {
              setSettings((prev) => ({
                ...prev,
                summary4h: next,
                summary8h: next ? false : prev.summary8h,
                summary24h: next ? false : prev.summary24h,
              }))
              setTelegramSaveMsg(null)
              setTelegramSaveErr(null)
            }}
            ariaLabel="Сводка за 4 часа"
          />
          <ToggleRow
            label="Сводка за 8 часов"
            checked={settings.summary8h}
            onChange={(next) => {
              setSettings((prev) => ({
                ...prev,
                summary8h: next,
                summary4h: next ? false : prev.summary4h,
                summary24h: next ? false : prev.summary24h,
              }))
              setTelegramSaveMsg(null)
              setTelegramSaveErr(null)
            }}
            ariaLabel="Сводка за 8 часов"
          />
          <ToggleRow
            label="Сводка за день"
            checked={settings.summary24h}
            onChange={(next) => {
              setSettings((prev) => ({
                ...prev,
                summary24h: next,
                summary4h: next ? false : prev.summary4h,
                summary8h: next ? false : prev.summary8h,
              }))
              setTelegramSaveMsg(null)
              setTelegramSaveErr(null)
            }}
            ariaLabel="Сводка за день"
          />

          <div className="dashboard-settings-control-row">
            <span className="dashboard-settings-control-row__label">Состояние бота</span>
            <div className="dashboard-settings-control-row__control">
              <span className={`dashboard-badge ${telegramConfigured ? 'dashboard-badge--active' : 'dashboard-badge--pending'}`}>
                {telegramConfigured ? 'Подключён' : 'Не настроен на сервере'}
              </span>
            </div>
          </div>

          {hasMultipleSummaryToggles(settings) ? (
            <p className="dashboard-field__note">
              На текущем бэке сохраняется только один интервал сводки. Если включено несколько, будет
              использован первый: 4ч, потом 8ч, потом 24ч.
            </p>
          ) : null}

          {telegramSaveErr && <p className="join-error">{telegramSaveErr}</p>}
          {telegramSaveMsg && <p className="dashboard-save-ok">{telegramSaveMsg}</p>}

          {telegramSaving ? <p className="dashboard-field__hint">Сохранение…</p> : null}
          <div className="dashboard-field">
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
      )}
    </section>
  )
}
