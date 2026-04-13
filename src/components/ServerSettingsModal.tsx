import { useCallback, useEffect, useState } from 'react'
import { fetchServerSettings, putServerSettings } from '../api/serverSettingsApi'
import {
  clampVmixIngressUiState,
  readLocalVmixIngressUiState,
  writeLocalVmixIngressUiState,
  VMIX_CLIENT_BITRATE_MAX_KBPS,
  VMIX_CLIENT_BITRATE_MIN_KBPS,
  VMIX_CLIENT_LATENCY_MAX_MS,
  VMIX_CLIENT_LATENCY_MIN_MS,
} from '../config/serverSettingsStorage'
import { adminAuthHeaders, hasAdminBearerToken } from '../utils/adminApiAuth'
import { signalingHttpBase } from '../utils/signalingBase'
import { getSignalingDisplayLines } from '../utils/signalingDisplay'

interface Props {
  open: boolean
  /** Во вкладке админки — без оверлея и кнопки «Закрыть». */
  variant?: 'modal' | 'inline'
  onClose?: () => void
}

function isAllowedSignalingUrl(s: string): boolean {
  const t = s.trim()
  if (t === '') return true
  if (t.length > 2048) return false
  try {
    const u = new URL(t)
    return ['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)
  } catch {
    return false
  }
}

export function ServerSettingsModal({ open, onClose, variant = 'modal' }: Props) {
  const isModal = variant === 'modal'
  const [signalingUrl, setSignalingUrl] = useState('')
  const [latencyMs, setLatencyMs] = useState(200)
  const [videoBitrateKbps, setVideoBitrateKbps] = useState<number | null>(4500)
  const [maxBitrateKbps, setMaxBitrateKbps] = useState<number | null>(null)
  const [useFixedListenPort, setUseFixedListenPort] = useState(false)
  const [listenPort, setListenPort] = useState(9000)
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [panelMessage, setPanelMessage] = useState<string | null>(null)
  const [restartBusy, setRestartBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)

  const lines = getSignalingDisplayLines()
  const hasClientSecret = hasAdminBearerToken()

  useEffect(() => {
    if (!open) {
      setLoadStatus('idle')
      return
    }
    let cancelled = false
    const local = readLocalVmixIngressUiState()
    setSignalingUrl('')
    setLatencyMs(local.latencyMs)
    setVideoBitrateKbps(local.videoBitrateKbps)
    setMaxBitrateKbps(local.maxBitrateKbps)
    setUseFixedListenPort(local.useFixedListenPort)
    setListenPort(local.listenPort)
    setPanelMessage(null)
    setLoadStatus('loading')

    ;(async () => {
      const r = await fetchServerSettings()
      if (cancelled) return
      if (r.ok) {
        const v = r.data.vmixIngress
        setSignalingUrl(r.data.signalingUrl ?? '')
        setLatencyMs(v.latencyMs)
        setVideoBitrateKbps(v.videoBitrateKbps)
        setMaxBitrateKbps(v.maxBitrateKbps)
        setUseFixedListenPort(v.useFixedListenPort)
        setListenPort(v.listenPort)
        writeLocalVmixIngressUiState(v)
        setLastSynced(r.data.updatedAt ?? null)
        setPanelMessage(null)
      } else {
        setLastSynced(null)
        if (r.status === 401) {
          setPanelMessage(
            '401: нужен корректный Bearer (или на сервере включён публичный GET — проверьте ADMIN_SETTINGS_PUBLIC_READ). Показаны vmix из браузера; signalingUrl не загружен.',
          )
        } else if (r.status === 404) {
          setPanelMessage('GET /api/admin/settings не найден. Показаны значения vmix из браузера.')
        } else if (r.status === 0) {
          setPanelMessage('Не удалось загрузить настройки с сервера. Показаны значения из браузера.')
        } else {
          setPanelMessage(`Не удалось загрузить (${r.status}): ${r.message}`)
        }
      }
      setLoadStatus('ready')
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  const copyPrimary = useCallback(() => {
    void navigator.clipboard.writeText(lines.primary).then(
      () => setPanelMessage('Адрес скопирован в буфер'),
      () => setPanelMessage('Не удалось скопировать'),
    )
    window.setTimeout(() => setPanelMessage(null), 2500)
  }, [lines.primary])

  const saveLocalOnly = useCallback(() => {
    const c = clampVmixIngressUiState({
      latencyMs,
      videoBitrateKbps,
      maxBitrateKbps,
      useFixedListenPort,
      listenPort,
    })
    writeLocalVmixIngressUiState(c)
    setLatencyMs(c.latencyMs)
    setVideoBitrateKbps(c.videoBitrateKbps)
    setMaxBitrateKbps(c.maxBitrateKbps)
    setUseFixedListenPort(c.useFixedListenPort)
    setListenPort(c.listenPort)
    setPanelMessage('Сохранено в этом браузере (кэш vmix для startVmixIngress). signalingUrl только на сервере.')
  }, [latencyMs, videoBitrateKbps, maxBitrateKbps, useFixedListenPort, listenPort])

  const saveRemote = useCallback(async () => {
    const trimmed = signalingUrl.trim()
    if (trimmed !== '' && !isAllowedSignalingUrl(trimmed)) {
      setPanelMessage('signalingUrl: только http/https/ws/wss, не длиннее 2048 символов.')
      return
    }
    setSaveBusy(true)
    setPanelMessage(null)
    const vmixIngress = clampVmixIngressUiState({
      latencyMs,
      videoBitrateKbps,
      maxBitrateKbps,
      useFixedListenPort,
      listenPort,
    })
    const r = await putServerSettings({
      vmixIngress,
      signalingUrl: trimmed === '' ? null : trimmed,
    })
    setSaveBusy(false)
    if (r.ok) {
      writeLocalVmixIngressUiState(r.data.vmixIngress)
      const v = r.data.vmixIngress
      setLatencyMs(v.latencyMs)
      setVideoBitrateKbps(v.videoBitrateKbps)
      setMaxBitrateKbps(v.maxBitrateKbps)
      setUseFixedListenPort(v.useFixedListenPort)
      setListenPort(v.listenPort)
      setSignalingUrl(r.data.signalingUrl ?? '')
      setLastSynced(r.data.updatedAt ?? null)
      setPanelMessage('Сохранено на сервере; vmix — также в кэше браузера.')
    } else {
      if (r.status === 401) {
        setPanelMessage(`401 — ${r.message} (PUT с секретом API_SECRET на сервере).`)
      } else {
        setPanelMessage(`Сервер: ${r.status} — ${r.message}`)
      }
    }
  }, [
    signalingUrl,
    latencyMs,
    videoBitrateKbps,
    maxBitrateKbps,
    useFixedListenPort,
    listenPort,
  ])

  const requestServerRestart = useCallback(async () => {
    setRestartBusy(true)
    setPanelMessage(null)
    try {
      const base = signalingHttpBase()
      const res = await fetch(`${base}/api/admin/server-restart`, {
        method: 'POST',
        headers: adminAuthHeaders(true),
        body: '{}',
      })
      if (res.status === 202) {
        setPanelMessage('Принято (202): сервер завершит процесс; PM2/systemd поднимут снова.')
      } else if (res.status === 503) {
        let detail = 'Рестарт отключён: задайте API_SECRET на сервере.'
        try {
          const j = (await res.json()) as { message?: string; error?: string }
          detail = j.error || j.message || detail
        } catch { /* noop */ }
        setPanelMessage(detail)
      } else if (res.status === 401) {
        setPanelMessage('401: нужен корректный Bearer (VITE_ADMIN_API_SECRET / VITE_SERVER_RESTART_SECRET).')
      } else if (res.status === 404) {
        setPanelMessage('Маршрут не найден: POST /api/admin/server-restart.')
      } else {
        setPanelMessage(`Ответ сервера: ${res.status} ${res.statusText}`)
      }
    } catch {
      setPanelMessage('Сеть или CORS: запрос не дошёл.')
    } finally {
      setRestartBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !isModal || !onClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isModal, onClose])

  if (!open) return null

  const panel = (
      <div
        className={`server-settings-panel${isModal ? '' : ' server-settings-panel--inline'}`}
        role={isModal ? 'dialog' : 'region'}
        aria-modal={isModal ? true : undefined}
        aria-labelledby="server-settings-title"
        onClick={isModal ? (e) => e.stopPropagation() : undefined}
      >
        <div className="server-settings-panel__head">
          <h2 id="server-settings-title" className="server-settings-panel__title">
            Настройки сервера
          </h2>
          {isModal && onClose ? (
            <button type="button" className="server-settings-panel__close" onClick={onClose} aria-label="Закрыть">
              ✕
            </button>
          ) : null}
        </div>

        <div className="server-settings-panel__body">
          {loadStatus === 'loading' && (
            <div className="server-settings-flash server-settings-flash--muted" role="status">
              Загрузка с сервера…
            </div>
          )}
          {panelMessage && loadStatus === 'ready' && (
            <div className="server-settings-flash" role="status">{panelMessage}</div>
          )}
          {lastSynced && loadStatus === 'ready' && (
            <p className="server-settings-section__note">Обновлено на сервере: {lastSynced}</p>
          )}

          <section className="server-settings-section">
            <h3 className="server-settings-section__title">Сервер (signaling)</h3>
            <p className="server-settings-section__hint">
              Адрес клиента (сборка). Ниже — значение с сервера (<code>signalingUrl</code>), если GET удался.
            </p>
            <div className="server-settings-kv">
              <span className="server-settings-kv__label">Точка подключения</span>
              <code className="server-settings-kv__value">{lines.primary}</code>
              <button type="button" className="server-settings-kv__copy" onClick={copyPrimary}>
                Копировать
              </button>
            </div>
            {lines.secondary && (
              <p className="server-settings-section__note">{lines.secondary}</p>
            )}
            <label className="server-settings-field">
              <span className="server-settings-field__label">signalingUrl на сервере</span>
              <input
                type="url"
                className="server-settings-field__input"
                placeholder="Пусто = null"
                value={signalingUrl}
                onChange={(e) => setSignalingUrl(e.target.value)}
                disabled={loadStatus === 'loading'}
              />
            </label>
          </section>

          <section className="server-settings-section">
            <h3 className="server-settings-section__title">Поток SRT → комната</h3>
            <p className="server-settings-section__hint">
              <code>vmixIngress</code> на сервере и в localStorage для <code>startVmixIngress</code>. Контракт — docs/SERVER_SETTINGS_PLAN.md.
            </p>

            <label className="server-settings-field">
              <span className="server-settings-field__label">Latency SRT (мс)</span>
              <input
                type="number"
                className="server-settings-field__input"
                min={VMIX_CLIENT_LATENCY_MIN_MS}
                max={VMIX_CLIENT_LATENCY_MAX_MS}
                step={10}
                value={latencyMs}
                onChange={(e) => setLatencyMs(Number(e.target.value))}
                disabled={loadStatus === 'loading'}
              />
            </label>

            <label className="server-settings-field">
              <span className="server-settings-field__label">Целевой битрейт видео (кбит/с), пусто = null</span>
              <input
                type="number"
                className="server-settings-field__input"
                min={VMIX_CLIENT_BITRATE_MIN_KBPS}
                max={VMIX_CLIENT_BITRATE_MAX_KBPS}
                step={50}
                value={videoBitrateKbps === null ? '' : videoBitrateKbps}
                onChange={(e) => {
                  const v = e.target.value
                  setVideoBitrateKbps(v === '' ? null : Number(v))
                }}
                disabled={loadStatus === 'loading'}
              />
            </label>

            <label className="server-settings-field">
              <span className="server-settings-field__label">Макс. битрейт (кбит/с), пусто = null</span>
              <input
                type="number"
                className="server-settings-field__input"
                min={VMIX_CLIENT_BITRATE_MIN_KBPS}
                max={VMIX_CLIENT_BITRATE_MAX_KBPS}
                step={50}
                value={maxBitrateKbps === null ? '' : maxBitrateKbps}
                onChange={(e) => {
                  const v = e.target.value
                  setMaxBitrateKbps(v === '' ? null : Number(v))
                }}
                disabled={loadStatus === 'loading'}
              />
            </label>

            <label className="server-settings-field server-settings-field--row">
              <input
                type="checkbox"
                checked={useFixedListenPort}
                onChange={(e) => setUseFixedListenPort(e.target.checked)}
                disabled={loadStatus === 'loading'}
              />
              <span className="server-settings-field__label">Постоянный порт входа SRT (useFixedListenPort)</span>
            </label>
            {useFixedListenPort && (
              <label className="server-settings-field">
                <span className="server-settings-field__label">Порт</span>
                <input
                  type="number"
                  className="server-settings-field__input"
                  min={1024}
                  max={65535}
                  value={listenPort}
                  onChange={(e) => setListenPort(Number(e.target.value))}
                  disabled={loadStatus === 'loading'}
                />
              </label>
            )}
          </section>

          <section className="server-settings-section">
            <h3 className="server-settings-section__title">Обслуживание</h3>
            <p className="server-settings-section__hint">
              <code>POST /api/admin/server-restart</code> с Bearer, если на сервере задан API_SECRET.
              {!hasClientSecret && ' Секрет в сборке не задан — при открытом рестарте на бэке запрос может пройти.'}
            </p>
            <button
              type="button"
              className="server-settings-restart-btn"
              disabled={restartBusy}
              onClick={() => { void requestServerRestart() }}
            >
              {restartBusy ? 'Запрос…' : 'Запросить перезагрузку сервера'}
            </button>
          </section>
        </div>

        <div
          className={`server-settings-panel__foot${isModal ? ' server-settings-panel__foot--split' : ' server-settings-panel__foot--inline'}`}
        >
          {isModal && onClose ? (
            <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" onClick={onClose}>
              Закрыть
            </button>
          ) : null}
          <div className="server-settings-panel__foot-actions">
            <button
              type="button"
              className="confirm-dialog__btn confirm-dialog__btn--secondary"
              disabled={loadStatus === 'loading' || saveBusy}
              onClick={saveLocalOnly}
            >
              Только в браузере (vmix)
            </button>
            <button
              type="button"
              className="confirm-dialog__btn confirm-dialog__btn--primary"
              disabled={loadStatus === 'loading' || saveBusy}
              title={!hasClientSecret ? 'Без секрета в сборке PUT может сработать, если API_SECRET на сервере пустой' : undefined}
              onClick={() => { void saveRemote() }}
            >
              {saveBusy ? 'Сохранение…' : 'Сохранить на сервере'}
            </button>
          </div>
        </div>
      </div>
  )

  if (!isModal) {
    return panel
  }

  return (
    <div className="confirm-dialog-root server-settings-overlay">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={() => onClose?.()} />
      {panel}
    </div>
  )
}
