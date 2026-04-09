import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RemoteParticipant } from '../../types'
import {
  DEFAULT_STUDIO_OUTPUT_PRESET_ID,
  STUDIO_OUTPUT_PRESETS,
  emptyStudioBoard,
  findStudioOutputPreset,
  type StudioOutputPreset,
  type StudioSourceOption,
} from '../../types/studio'
import { drawVideoCover } from '../../utils/studioCanvasDraw'
import { buildStudioSources } from './buildStudioSources'
import { connectStudioProgramAudioMix, type StudioProgramMixHandle, type StudioSourceMixMap } from './buildProgramAudioMix'
import { StudioBoardPanel } from './StudioBoardPanel'
import { StudioSourceStripItem } from './StudioSourceStripItem'
import { AudioMeter } from '../AudioMeter'

/* ─── Studio debug log ──────────────────────────────────────────────── */
type LogLevel = 'info' | 'ok' | 'warn' | 'error' | 'server'
interface LogEntry { ts: string; level: LogLevel; text: string }
const LOG_MAX = 100
function nowTs() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

const LS_RTMP_URL = 'vmix_studio_rtmp_url'
const LS_RTMP_KEY = 'vmix_studio_rtmp_key'
const LS_STUDIO_OUTPUT = 'vmix_studio_output_preset'
const LS_STUDIO_SEND_AUDIO = 'vmix_studio_send_audio'

function sourceMeterStream(s: StudioSourceOption): MediaStream | null {
  if (s.meterStream?.getAudioTracks().length) return s.meterStream
  if (s.stream.getAudioTracks().length) return s.stream
  return null
}

interface Props {
  open: boolean
  onClose: () => void
  participants: Map<string, RemoteParticipant>
  localPeerId: string | null
  localStream: MediaStream | null
  localScreenStream: MediaStream | null
  localDisplayName: string
  startStudioProgram: (
    videoTrack: MediaStreamTrack,
    audioTrack: MediaStreamTrack | null,
    rtmpUrl: string,
    streamKey: string,
    output: StudioOutputPreset,
  ) => Promise<{ ok: boolean; error?: string }>
  stopStudioProgram: () => void
  replaceStudioProgramAudioTrack: (track: MediaStreamTrack | null) => Promise<void>
  studioBroadcastHealth: 'idle' | 'connecting' | 'live' | 'warning'
  studioBroadcastHealthDetail?: string | null
  /** Строки с сокета (useRoom); в панели отображаются фиолетовым. */
  studioServerLogLines?: readonly string[]
}

export function StudioModeWorkspace({
  open,
  onClose,
  participants,
  localPeerId,
  localStream,
  localScreenStream,
  localDisplayName,
  startStudioProgram,
  stopStudioProgram,
  replaceStudioProgramAudioTrack,
  studioBroadcastHealth,
  studioBroadcastHealthDetail = null,
  studioServerLogLines = [],
}: Props) {
  const [boards, setBoards] = useState(() => ({
    preview: emptyStudioBoard(),
    program: emptyStudioBoard(),
  }))
  const previewBoard = boards.preview
  const programBoard = boards.program
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rtmpUrl, setRtmpUrl] = useState(() => localStorage.getItem(LS_RTMP_URL) ?? '')
  const [rtmpKey, setRtmpKey] = useState(() => localStorage.getItem(LS_RTMP_KEY) ?? '')
  const [outputPresetId, setOutputPresetId] = useState(
    () => localStorage.getItem(LS_STUDIO_OUTPUT) ?? DEFAULT_STUDIO_OUTPUT_PRESET_ID,
  )
  const [sendStudioAudio, setSendStudioAudio] = useState(
    () => localStorage.getItem(LS_STUDIO_SEND_AUDIO) !== '0',
  )
  const [liveActive, setLiveActive] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [programMixStream, setProgramMixStream] = useState<MediaStream | null>(null)
  const [sourceMix, setSourceMix] = useState<StudioSourceMixMap>({})
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((level: LogLevel, text: string) => {
    const entry: LogEntry = { ts: nowTs(), level, text }
    setLogs((prev) => {
      const next = [...prev, entry]
      return next.length > LOG_MAX ? next.slice(next.length - LOG_MAX) : next
    })
    if (import.meta.env.DEV) {
      const fn =
        level === 'error'
          ? console.error
          : level === 'warn'
            ? console.warn
            : console.log
      fn(`[studio ${level === 'server' ? 'SERVER' : 'client'} ${entry.ts}]`, text)
    }
  }, [])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const programVideoElsRef = useRef<(HTMLVideoElement | null)[]>(Array.from({ length: 6 }, () => null))
  const programBoardRef = useRef(programBoard)
  programBoardRef.current = programBoard

  const outputPresetRef = useRef<StudioOutputPreset>(findStudioOutputPreset(outputPresetId))
  outputPresetRef.current = findStudioOutputPreset(outputPresetId)

  const mixAudioCtxRef = useRef<AudioContext | null>(null)
  const mixDisconnectRef = useRef<(() => void) | null>(null)
  const mixHandleRef = useRef<StudioProgramMixHandle | null>(null)
  const sourceMixRef = useRef(sourceMix)
  sourceMixRef.current = sourceMix

  const sources = useMemo(
    () =>
      buildStudioSources(
        participants,
        localPeerId,
        localStream,
        localScreenStream,
        localDisplayName,
      ),
    [participants, localPeerId, localStream, localScreenStream, localDisplayName],
  )

  useEffect(() => {
    setSourceMix((prev) => {
      const next = { ...prev }
      for (const s of sources) {
        if (!(s.key in next)) next[s.key] = { volume: 1 }
      }
      return next
    })
  }, [sources])

  const registerProgramVideo = useCallback((slotIndex: number, el: HTMLVideoElement | null) => {
    programVideoElsRef.current[slotIndex] = el
  }, [])

  const swapBoards = useCallback(() => {
    setBoards((b) => ({ preview: b.program, program: b.preview }))
  }, [])

  const setSourceVolume = useCallback((key: string, volume: number) => {
    setSourceMix((p) => ({
      ...p,
      [key]: { ...(p[key] ?? { volume: 1 }), volume },
    }))
  }, [])

  const stopCaptureLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    captureStreamRef.current?.getTracks().forEach((t) => t.stop())
    captureStreamRef.current = null
  }, [])

  const runCaptureLoop = useCallback(async (): Promise<MediaStreamTrack | null> => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const { width: CAP_W, height: CAP_H, maxFramerate } = outputPresetRef.current
    canvas.width = CAP_W
    canvas.height = CAP_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const tick = () => {
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, CAP_W, CAP_H)
      const b = programBoardRef.current
      for (let i = 0; i < 6; i++) {
        const slot = b.slots[i]
        const v = programVideoElsRef.current[i]
        if (!slot?.sourceKey || !v) continue
        const dx = slot.rect.x * CAP_W
        const dy = slot.rect.y * CAP_H
        const dw = slot.rect.w * CAP_W
        const dh = slot.rect.h * CAP_H
        drawVideoCover(ctx, v, dx, dy, dw, dh)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    /* Рисуем первый кадр ДО captureStream, чтобы трек сразу содержал данные. */
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        tick()
        resolve()
      })
    })

    /* captureStream(fps) — фиксированная частота кадров обязательна:
       без аргумента Chrome создаёт трек с frameRate=0, WebRTC-кодер
       не получает стабильного потока и держит битрейт ~100 кбит/с. */
    const stream = canvas.captureStream(maxFramerate)
    captureStreamRef.current = stream
    return stream.getVideoTracks()[0] ?? null
  }, [])

  useEffect(() => {
    if (!open) {
      mixDisconnectRef.current?.()
      mixDisconnectRef.current = null
      mixHandleRef.current = null
      void mixAudioCtxRef.current?.close()
      mixAudioCtxRef.current = null
      setProgramMixStream(null)
      return
    }

    let ctx = mixAudioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext()
      mixAudioCtxRef.current = ctx
    }
    void ctx.resume()

    mixDisconnectRef.current?.()
    const handle = connectStudioProgramAudioMix(programBoard, sources, ctx, sourceMixRef.current)
    mixHandleRef.current = handle
    mixDisconnectRef.current = handle.disconnect
    setProgramMixStream(handle.stream)

    return () => {
      handle.disconnect()
      mixHandleRef.current = null
      mixDisconnectRef.current = null
    }
  }, [open, programBoard, sources])

  useEffect(() => {
    mixHandleRef.current?.applyLevels(sourceMix)
  }, [sourceMix])

  useEffect(() => {
    if (!open) return
    void mixAudioCtxRef.current?.resume()
  }, [open])

  useEffect(() => {
    if (!liveActive) return
    const t = sendStudioAudio ? programMixStream?.getAudioTracks()[0] ?? null : null
    void replaceStudioProgramAudioTrack(t)
  }, [liveActive, sendStudioAudio, programMixStream, replaceStudioProgramAudioTrack])

  const handleLiveToggle = useCallback(async () => {
    if (liveActive) {
      addLog('info', 'Остановка эфира пользователем')
      stopCaptureLoop()
      stopStudioProgram()
      setLiveActive(false)
      setLiveError(null)
      addLog('info', 'Эфир остановлен')
      return
    }
    const url = rtmpUrl.trim()
    const key = rtmpKey.trim()
    if (!url || !key) {
      setSettingsOpen(true)
      setLiveError('Укажите URL и ключ в настройках потока')
      addLog('error', 'Старт эфира: не задан URL или ключ')
      return
    }
    setLiveError(null)
    const preset = findStudioOutputPreset(outputPresetId)
    outputPresetRef.current = preset
    addLog('info', `Старт эфира → ${preset.label} (${preset.width}×${preset.height}, ${Math.round(preset.maxBitrate / 1000)} кбит/с, ${preset.maxFramerate} fps)`)
    addLog('info', `RTMP URL: ${url.replace(/\/[^/]+$/, '/***')}`)

    addLog('info', 'Захват канваса…')
    const track = await runCaptureLoop()
    if (!track) {
      setLiveError('Не удалось захватить канвас')
      addLog('error', 'canvas.captureStream() вернул null — трек не получен')
      return
    }
    const trackSettings = track.getSettings()
    addLog('ok', `Трек захвачен: ${trackSettings.width ?? '?'}×${trackSettings.height ?? '?'} @ ${trackSettings.frameRate ?? '?'} fps, readyState=${track.readyState}`)

    const audioTrack =
      sendStudioAudio && programMixStream?.getAudioTracks()[0]
        ? programMixStream.getAudioTracks()[0]!
        : null
    addLog('info', audioTrack ? `Аудио: ${audioTrack.label || 'программный микс'}` : 'Аудио: без звука')

    addLog('info', 'produce() → signaling…')
    const res = await startStudioProgram(track, audioTrack, url, key, preset)
    if (!res.ok) {
      stopCaptureLoop()
      const errMsg = res.error ?? 'Ошибка публикации'
      setLiveError(errMsg)
      setLiveActive(false)
      addLog('error', `startStudioProgram failed: ${errMsg}`)
      return
    }
    setLiveActive(true)
    addLog('ok', 'produce() успешно, ждём подтверждения сервера (studioBroadcastHealth)…')
  }, [
    liveActive,
    rtmpUrl,
    rtmpKey,
    outputPresetId,
    sendStudioAudio,
    programMixStream,
    addLog,
    runCaptureLoop,
    startStudioProgram,
    stopCaptureLoop,
    stopStudioProgram,
  ])

  useEffect(() => {
    if (!open) {
      stopCaptureLoop()
      stopStudioProgram()
      setLiveActive(false)
      setLiveError(null)
    }
  }, [open, stopCaptureLoop, stopStudioProgram])

  useEffect(() => {
    return () => {
      stopCaptureLoop()
    }
  }, [stopCaptureLoop])

  useEffect(() => {
    if (logsOpen) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs, logsOpen])

  const serverLogConsumedRef = useRef(0)
  useEffect(() => {
    if (studioServerLogLines.length === 0) {
      serverLogConsumedRef.current = 0
      return
    }
    for (; serverLogConsumedRef.current < studioServerLogLines.length; serverLogConsumedRef.current++) {
      const line = studioServerLogLines[serverLogConsumedRef.current]
      if (line) addLog('server', line)
    }
  }, [studioServerLogLines, addLog])

  const saveRtmpSettings = useCallback(() => {
    localStorage.setItem(LS_RTMP_URL, rtmpUrl.trim())
    localStorage.setItem(LS_RTMP_KEY, rtmpKey.trim())
    localStorage.setItem(LS_STUDIO_OUTPUT, outputPresetId)
    localStorage.setItem(LS_STUDIO_SEND_AUDIO, sendStudioAudio ? '1' : '0')
    setSettingsOpen(false)
  }, [rtmpUrl, rtmpKey, outputPresetId, sendStudioAudio])

  if (!open) return null

  const liveBtnClass =
    liveActive && studioBroadcastHealth === 'live'
      ? 'studio-chrome__live studio-chrome__live--on-air'
      : liveActive && (studioBroadcastHealth === 'connecting' || studioBroadcastHealth === 'warning')
        ? 'studio-chrome__live studio-chrome__live--warn'
        : 'studio-chrome__live'

  const liveBtnTitle =
    !liveActive
      ? 'Начать эфир (в эфир идёт только доска «Эфир»)'
      : studioBroadcastHealth === 'live'
        ? 'Остановить эфир'
        : studioBroadcastHealthDetail
          ? `Сервер: ${studioBroadcastHealthDetail}`
          : studioBroadcastHealth === 'connecting'
            ? 'Подключение RTMP…'
            : 'Эфир: предупреждение от сервера'

  return (
    <div className="studio-mode-workspace" role="dialog" aria-modal="true" aria-label="Режим студии">
      <canvas
        ref={canvasRef}
        className="studio-mode-workspace__capture-canvas"
        width={findStudioOutputPreset(outputPresetId).width}
        height={findStudioOutputPreset(outputPresetId).height}
        aria-hidden
      />

      <header className="studio-chrome">
        <button type="button" className="studio-chrome__close" onClick={onClose}>
          Закрыть студию
        </button>
        <div className="studio-chrome__actions">
          <button type="button" className="studio-chrome__settings" onClick={() => setSettingsOpen(true)}>
            Настройки потока
          </button>
          <button
            type="button"
            className={liveBtnClass}
            onClick={() => void handleLiveToggle()}
            title={liveBtnTitle}
          >
            LIVE
          </button>
        </div>
      </header>

      {liveError ? <div className="studio-mode-workspace__error" role="alert">{liveError}</div> : null}
      {liveActive &&
      studioBroadcastHealth !== 'live' &&
      studioBroadcastHealthDetail ? (
        <div className="studio-mode-workspace__health-hint" role="status">
          {studioBroadcastHealthDetail}
        </div>
      ) : null}

      <div className="studio-mode-workspace__body">
        <div className="studio-mode-workspace__boards-row">
          <StudioBoardPanel
            title="Превью"
            board={previewBoard}
            onBoardChange={(next) => setBoards((b) => ({ ...b, preview: next }))}
            sources={sources}
          />
          <button type="button" className="studio-swap-btn studio-swap-btn--between" onClick={swapBoards} title="Поменять превью и эфир местами">
            ⇄
          </button>
          <div className="studio-board-column studio-board-column--program">
            <StudioBoardPanel
              title="Эфир"
              board={programBoard}
              onBoardChange={(next) => setBoards((b) => ({ ...b, program: next }))}
              sources={sources}
              registerProgramVideo={registerProgramVideo}
              hideSlotPickers
              readOnlyStage
            />
            <div className="studio-program-output-meter">
              <div className="studio-program-output-meter__head">
                <span className="studio-program-output-meter__label">Смесь эфира</span>
              </div>
              <div className="studio-program-output-meter__meter">
                {programMixStream ? (
                  <AudioMeter stream={programMixStream} orientation="horizontal" />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="studio-source-strip" role="region" aria-label="Источники">
          {sources.map((s) => (
            <StudioSourceStripItem
              key={s.key}
              source={s}
              meterStream={sourceMeterStream(s)}
              volume={sourceMix[s.key]?.volume ?? 1}
              onVolumeChange={(v) => setSourceVolume(s.key, v)}
            />
          ))}
        </div>

        <div className="studio-debug-log">
          <div className="studio-debug-log__header">
            <button
              type="button"
              className="studio-debug-log__toggle"
              onClick={() => setLogsOpen((v) => !v)}
            >
              {logsOpen ? '▾' : '▸'} Лог подключения
              {logs.length > 0 && (
                <span className="studio-debug-log__count">{logs.length}</span>
              )}
            </button>
            {logsOpen && (
              <>
                <button
                  type="button"
                  className="studio-debug-log__copy"
                  onClick={() => void navigator.clipboard.writeText(
                    logs.map((e) => `[${e.ts}] [${e.level.toUpperCase()}] ${e.text}`).join('\n')
                  )}
                >
                  Копировать
                </button>
                <button
                  type="button"
                  className="studio-debug-log__clear"
                  onClick={() => setLogs([])}
                >
                  Очистить
                </button>
              </>
            )}
          </div>
          {logsOpen && (
            <div className="studio-debug-log__body">
              {logs.length === 0 ? (
                <span className="studio-debug-log__empty">Нет событий</span>
              ) : (
                logs.map((e, i) => (
                  <div key={i} className={`studio-debug-log__line studio-debug-log__line--${e.level}`}>
                    <span className="studio-debug-log__ts">{e.ts}</span>
                    <span className="studio-debug-log__text">{e.text}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>

      {settingsOpen ? (
        <div className="studio-settings-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSettingsOpen(false)}>
          <div className="studio-settings-modal" role="dialog" aria-labelledby="studio-settings-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="studio-settings-title" className="studio-settings-modal__title">Настройки потока</h2>
            <p className="studio-settings-modal__hint">Custom RTMP (например rtmps://a.rtmps.youtube.com:443/live2)</p>
            <label className="studio-settings-modal__field">
              <span>Разрешение выхода</span>
              <select
                className="studio-settings-modal__input studio-settings-modal__select"
                value={outputPresetId}
                disabled={liveActive}
                onChange={(e) => setOutputPresetId(e.target.value)}
              >
                {STUDIO_OUTPUT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} ({p.width}×{p.height})
                  </option>
                ))}
              </select>
            </label>
            <label className="studio-settings-modal__field studio-settings-modal__field--row">
              <input
                type="checkbox"
                checked={sendStudioAudio}
                disabled={liveActive}
                onChange={(e) => setSendStudioAudio(e.target.checked)}
              />
              <span>Передавать звук на RTMP (микшер слотов «Эфир»)</span>
            </label>
            <label className="studio-settings-modal__field">
              <span>URL</span>
              <input
                type="url"
                className="studio-settings-modal__input"
                value={rtmpUrl}
                onChange={(e) => setRtmpUrl(e.target.value)}
                placeholder="rtmps://…"
                autoComplete="off"
              />
            </label>
            <label className="studio-settings-modal__field">
              <span>Ключ / stream key</span>
              <input
                type="password"
                className="studio-settings-modal__input"
                value={rtmpKey}
                onChange={(e) => setRtmpKey(e.target.value)}
                placeholder="Секретный ключ"
                autoComplete="off"
              />
            </label>
            {liveActive ? (
              <p className="studio-settings-modal__live-hint">Во время эфира разрешение и звук не меняются — остановите LIVE.</p>
            ) : null}
            <div className="studio-settings-modal__actions">
              <button type="button" className="studio-settings-modal__btn" onClick={() => setSettingsOpen(false)}>
                Отмена
              </button>
              <button type="button" className="studio-settings-modal__btn studio-settings-modal__btn--primary" onClick={saveRtmpSettings}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
