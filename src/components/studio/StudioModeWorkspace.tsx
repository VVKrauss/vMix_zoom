import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RemoteParticipant } from '../../types'
import {
  DEFAULT_STUDIO_OUTPUT_PRESET_ID,
  STUDIO_OUTPUT_PRESETS,
  emptyStudioBoard,
  findStudioOutputPreset,
  type StudioBoardState,
  type StudioOutputPreset,
  type StudioSourceOption,
} from '../../types/studio'
import { drawStudioParticipantPlaceholder, drawVideoCover } from '../../utils/studioCanvasDraw'
import { buildStudioSources } from './buildStudioSources'
import { connectStudioProgramAudioMix, type StudioProgramMixHandle, type StudioSourceMixMap } from './buildProgramAudioMix'
import { StudioBoardPanel } from './StudioBoardPanel'
import StudioSourceStripItem from './StudioSourceStripItem'
import { AudioMeter } from '../AudioMeter'
import { ConfirmDialog } from '../ConfirmDialog'

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
  if (s.stream?.getAudioTracks().length) return s.stream
  return null
}

const StudioSourcesStrip = memo(function StudioSourcesStrip({
  sources,
  sourceMix,
  setSourceVolume,
  onAddToPreview,
  onSendToProgram,
}: {
  sources: StudioSourceOption[]
  sourceMix: StudioSourceMixMap
  setSourceVolume: (key: string, volume: number) => void
  onAddToPreview: (key: string) => void
  onSendToProgram: (key: string) => void
}) {
  return (
    <div className="studio-source-strip" role="region" aria-label="Источники">
      {sources.map((s) => (
        <StudioSourceStripItem
          key={s.key}
          source={s}
          meterStream={sourceMeterStream(s)}
          volume={sourceMix[s.key]?.volume ?? 1}
          setVolume={setSourceVolume}
          onAddToPreview={onAddToPreview}
          onSendToProgram={onSendToProgram}
        />
      ))}
    </div>
  )
})

interface Props {
  open: boolean
  onClose: () => void
  participants: Map<string, RemoteParticipant>
  localPeerId: string | null
  localStream: MediaStream | null
  localScreenStream: MediaStream | null
  localDisplayName: string
  startStudioPreview: (videoTrack: MediaStreamTrack) => Promise<{ ok: boolean; error?: string }>
  stopStudioPreview: () => Promise<void>
  startStudioProgram: (
    videoTrack: MediaStreamTrack,
    audioTrack: MediaStreamTrack | null,
    rtmpUrl: string,
    streamKey: string,
    output: StudioOutputPreset,
  ) => Promise<{ ok: boolean; error?: string; warning?: string }>
  stopStudioProgram: () => Promise<void>
  replaceStudioProgramAudioTrack: (track: MediaStreamTrack | null) => Promise<void>
  studioBroadcastHealth: 'idle' | 'connecting' | 'live' | 'warning'
  studioBroadcastHealthDetail?: string | null
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
  startStudioPreview,
  stopStudioPreview,
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
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [programMixStream, setProgramMixStream] = useState<MediaStream | null>(null)
  const [sourceMix, setSourceMix] = useState<StudioSourceMixMap>({})
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsOpen, setLogsOpen] = useState(false)
  const [stopConfirmOpen, setStopConfirmOpen] = useState(false)
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
  const logoImageRef = useRef<HTMLImageElement | null>(null)
  const programBoardRef = useRef(programBoard)
  programBoardRef.current = programBoard

  const outputPresetRef = useRef<StudioOutputPreset>(findStudioOutputPreset(outputPresetId))
  outputPresetRef.current = findStudioOutputPreset(outputPresetId)

  const mixAudioCtxRef = useRef<AudioContext | null>(null)
  const mixDisconnectRef = useRef<(() => void) | null>(null)
  const mixHandleRef = useRef<StudioProgramMixHandle | null>(null)
  const programMixRebuildKeyRef = useRef('')
  const sourceMixRef = useRef(sourceMix)
  sourceMixRef.current = sourceMix

  useEffect(() => {
    const img = new Image()
    img.decoding = 'async'
    img.src = '/logo.png'
    logoImageRef.current = img
    return () => {
      if (logoImageRef.current === img) logoImageRef.current = null
    }
  }, [])

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

  const onPreviewBoardChange = useCallback((next: StudioBoardState) => {
    setBoards((b) => ({ ...b, preview: next }))
  }, [])

  const onProgramBoardChange = useCallback((next: StudioBoardState) => {
    setBoards((b) => ({ ...b, program: next }))
  }, [])

  const setSourceVolume = useCallback((key: string, volume: number) => {
    setSourceMix((p) => ({
      ...p,
      [key]: { ...(p[key] ?? { volume: 1 }), volume },
    }))
  }, [])

  const placeSourceOnBoard = useCallback((boardName: 'preview' | 'program', sourceKey: string, fullFrame = false) => {
    setBoards((prev) => {
      const board = prev[boardName]
      let slots = board.slots.map((slot) => ({ ...slot }))
      if (fullFrame) {
        slots = slots.map((slot, index) => ({
          ...slot,
          sourceKey: index === 0 ? sourceKey : null,
          rect: index === 0 ? { x: 0, y: 0, w: 1, h: 1 } : slot.rect,
        }))
      } else {
        const existingIndex = slots.findIndex((slot) => slot.sourceKey === sourceKey)
        const targetIndex = existingIndex >= 0 ? existingIndex : slots.findIndex((slot) => !slot.sourceKey)
        const finalIndex = targetIndex >= 0 ? targetIndex : 0
        slots[finalIndex] = { ...slots[finalIndex], sourceKey }
      }
      return { ...prev, [boardName]: { ...board, slots } }
    })
  }, [])

  const stopCaptureLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    captureStreamRef.current?.getTracks().forEach((t) => t.stop())
    captureStreamRef.current = null
  }, [])

  const runCaptureLoop = useCallback(async (): Promise<MediaStreamTrack | null> => {
    const existingTrack = captureStreamRef.current?.getVideoTracks()[0] ?? null
    if (existingTrack && existingTrack.readyState === 'live') return existingTrack

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
      let drewContent = false
      for (let i = 0; i < 6; i++) {
        const slot = b.slots[i]
        if (!slot?.sourceKey) continue
        const src = sources.find((item) => item.key === slot.sourceKey)
        if (!src) continue
        const dx = slot.rect.x * CAP_W
        const dy = slot.rect.y * CAP_H
        const dw = slot.rect.w * CAP_W
        const dh = slot.rect.h * CAP_H
        const v = programVideoElsRef.current[i]
        if (src.stream && v) {
          drawVideoCover(ctx, v, dx, dy, dw, dh)
          drewContent = true
        } else {
          drawStudioParticipantPlaceholder(ctx, src.displayName, dx, dy, dw, dh)
          drewContent = true
        }
      }

      if (!drewContent) {
        const t = performance.now() / 1000
        const pulse = 0.92 + Math.sin(t * 1.8) * 0.05
        const glow = 0.16 + ((Math.sin(t * 1.4) + 1) / 2) * 0.1
        const logo = logoImageRef.current
        const size = Math.min(CAP_W, CAP_H) * 0.24 * pulse
        const x = CAP_W / 2 - size / 2
        const y = CAP_H / 2 - size * 0.8

        const bg = ctx.createRadialGradient(CAP_W / 2, CAP_H / 2, 0, CAP_W / 2, CAP_H / 2, CAP_W * 0.55)
        bg.addColorStop(0, `rgba(191, 18, 18, ${glow})`)
        bg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, CAP_W, CAP_H)

        if (logo && logo.complete) {
          ctx.save()
          ctx.globalAlpha = 0.88 + Math.sin(t * 1.6) * 0.08
          ctx.drawImage(logo, x, y, size, size)
          ctx.restore()
        }

        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.font = '600 34px Inter, Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('ЭФИР', CAP_W / 2, CAP_H / 2 + 70)

        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.font = '500 18px Inter, Arial, sans-serif'
        ctx.fillText('Студия запущена', CAP_W / 2, CAP_H / 2 + 108)
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        tick()
        resolve()
      })
    })

    const stream = canvas.captureStream(maxFramerate)
    captureStreamRef.current = stream
    const v = stream.getVideoTracks()[0] ?? null
    if (v && 'contentHint' in v) {
      try {
        v.contentHint = 'motion'
      } catch {
      }
    }
    return v
  }, [])

  useEffect(() => {
    if (!open) {
      programMixRebuildKeyRef.current = ''
      mixDisconnectRef.current?.()
      mixDisconnectRef.current = null
      mixHandleRef.current = null
      void mixAudioCtxRef.current?.close()
      mixAudioCtxRef.current = null
      setProgramMixStream(null)
      return
    }

    const slotPart = programBoard.slots.map((s) => s.sourceKey ?? '').join('|')
    const streamPart = sources
      .map((s) => `${s.key}:${s.stream?.id ?? 'placeholder'}`)
      .sort()
      .join('|')
    const rebuildKey = `${slotPart}||${streamPart}`
    if (rebuildKey === programMixRebuildKeyRef.current && mixHandleRef.current) {
      return
    }
    programMixRebuildKeyRef.current = rebuildKey

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

  useEffect(() => {
    if (!open || liveActive) return
    let cancelled = false
    void (async () => {
      const track = await runCaptureLoop()
      if (!track || cancelled) return
      const res = await startStudioPreview(track)
      if (!res.ok && !cancelled) {
        setLiveError(res.error ?? 'Не удалось показать эфир в комнате')
        addLog('warn', `Превью студии не опубликовано: ${res.error ?? 'неизвестная ошибка'}`)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, liveActive, runCaptureLoop, startStudioPreview, addLog])

  const handleLiveToggle = useCallback(async () => {
    if (liveBusy) return

    if (liveActive) {
      setStopConfirmOpen(true)
      return
    }

    setLiveBusy(true)
    const url = rtmpUrl.trim()
    const key = rtmpKey.trim()
    if (!url || !key) {
      setSettingsOpen(true)
      setLiveError('Укажите URL и ключ в настройках потока')
      addLog('error', 'Старт эфира: не задан URL или ключ')
      setLiveBusy(false)
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

    const audioSourceTrack =
      sendStudioAudio && programMixStream?.getAudioTracks()[0]
        ? programMixStream.getAudioTracks()[0]!
        : null
    const audioTrack = audioSourceTrack ? audioSourceTrack.clone() : null
    addLog('info', audioTrack ? `Аудио: ${audioTrack.label || 'программный микс'}` : 'Аудио: без звука')

    addLog('info', 'produce() → signaling…')
    const res = await startStudioProgram(track, audioTrack, url, key, preset)
    if (!res.ok) {
      const errMsg = res.error ?? 'Ошибка публикации'
      setLiveError(errMsg)
      setLiveActive(false)
      audioTrack?.stop()
      addLog('error', `startStudioProgram failed: ${errMsg}`)
      const previewRes = await startStudioPreview(track)
      if (!previewRes.ok) {
        addLog('warn', `Не удалось вернуть превью студии: ${previewRes.error ?? 'неизвестная ошибка'}`)
      }
      setLiveBusy(false)
      return
    }
    setLiveActive(true)
    if (res.warning) {
      addLog('warn', res.warning)
    }
    addLog('ok', 'produce() успешно, ждём подтверждения сервера (studioBroadcastHealth)…')
    setLiveBusy(false)
  }, [
    liveBusy,
    liveActive,
    rtmpUrl,
    rtmpKey,
    outputPresetId,
    sendStudioAudio,
    programMixStream,
    addLog,
    runCaptureLoop,
    startStudioPreview,
    startStudioProgram,
    stopStudioProgram,
  ])

  const confirmStopLive = useCallback(async () => {
    setStopConfirmOpen(false)
    setLiveBusy(true)
    addLog('info', 'Остановка эфира пользователем')
    try {
      await stopStudioProgram()
      setLiveActive(false)
      setLiveError(null)
      addLog('info', 'Эфир остановлен')
      const track = await runCaptureLoop()
      if (track) {
        const res = await startStudioPreview(track)
        if (!res.ok) {
          addLog('warn', `Не удалось вернуть превью студии: ${res.error ?? 'неизвестная ошибка'}`)
        }
      }
    } finally {
      setLiveBusy(false)
    }
  }, [addLog, runCaptureLoop, startStudioPreview, stopStudioProgram])

  useEffect(() => {
    if (!open) {
      void stopStudioPreview()
      stopCaptureLoop()
      stopStudioProgram()
      setLiveActive(false)
      setLiveError(null)
    }
  }, [open, stopCaptureLoop, stopStudioPreview, stopStudioProgram])

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
        : liveBusy || studioBroadcastHealth === 'connecting'
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

  const healthLabel =
    studioBroadcastHealth === 'live'
      ? 'В эфире'
      : studioBroadcastHealth === 'connecting'
        ? 'Подключение'
        : studioBroadcastHealth === 'warning'
          ? 'Нужна проверка'
          : 'Готово'

  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null
  const latestLogText = latestLog ? `${latestLog.ts} ${latestLog.text}` : 'Лог пуст, студия готова к работе'

  return (
    <div className="studio-mode-workspace" role="dialog" aria-modal="true" aria-label="Режим студии">
      <canvas ref={canvasRef} className="studio-mode-workspace__capture-canvas" aria-hidden />

      <header className="studio-chrome">
        <div className="studio-chrome__identity">
          <div className="studio-chrome__title-row">
            <img className="studio-chrome__logo" src="/logo.png" alt="" draggable={false} />
            <h1 className="studio-chrome__title">Студия</h1>
          </div>
        </div>
        <div className="studio-chrome__actions">
          <span className={`studio-chrome__health studio-chrome__health--${studioBroadcastHealth}`}>
            {healthLabel}
          </span>
          <button
            type="button"
            className={liveBtnClass}
            onClick={() => void handleLiveToggle()}
            title={liveBtnTitle}
            disabled={liveBusy}
          >
            LIVE
          </button>
          <button type="button" className="studio-chrome__settings" onClick={() => setSettingsOpen(true)} aria-label="Настройки потока" title="Настройки потока">
            <GearIcon />
          </button>
          <button type="button" className="studio-chrome__close" onClick={onClose}>
            Закрыть студию
          </button>
        </div>
      </header>

      {liveError ? <div className="studio-mode-workspace__error" role="alert">{liveError}</div> : null}
      {liveActive && studioBroadcastHealth !== 'live' && studioBroadcastHealthDetail ? (
        <div className="studio-mode-workspace__health-hint" role="status">
          {studioBroadcastHealthDetail}
        </div>
      ) : null}

      <div className="studio-mode-workspace__body">
        <section className="studio-info-panel" aria-label="Информация студии">
          <div className="studio-info-card studio-info-card--summary">
            <span className="studio-info-card__label">Статус</span>
            <strong className="studio-info-card__value">{healthLabel}</strong>
            <span className="studio-info-card__subtle studio-info-card__subtle--truncate">
              {studioBroadcastHealthDetail || latestLogText}
            </span>
            <div className="studio-info-card__meta-inline">
              {logs.length > 0 ? <span className="studio-info-card__counter">{logs.length}</span> : null}
              <button type="button" className="studio-info-card__action" onClick={() => setLogsOpen(true)}>
                Открыть лог
              </button>
            </div>
          </div>
        </section>

        <div className="studio-mode-workspace__boards-row">
          <StudioBoardPanel
            title="Превью"
            variant="preview"
            board={previewBoard}
            onBoardChange={onPreviewBoardChange}
            sources={sources}
          />
          <div className="studio-action-rail" aria-label="Действия между preview и program">
            <button type="button" className="studio-swap-btn studio-swap-btn--switch" onClick={swapBoards} title="Поменять превью и эфир местами">
              Switch
            </button>
          </div>
          <div className="studio-board-column studio-board-column--program">
            <StudioBoardPanel
              title="Эфир"
              variant="program"
              board={programBoard}
              onBoardChange={onProgramBoardChange}
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
                {programMixStream ? <AudioMeter stream={programMixStream} orientation="horizontal" /> : null}
              </div>
            </div>
          </div>
        </div>

        <StudioSourcesStrip
          sources={sources}
          sourceMix={sourceMix}
          setSourceVolume={setSourceVolume}
          onAddToPreview={(key) => placeSourceOnBoard('preview', key)}
          onSendToProgram={(key) => placeSourceOnBoard('program', key, true)}
        />
      </div>

      {logsOpen ? (
        <div className="studio-debug-log-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setLogsOpen(false)}>
          <div className="studio-debug-log-modal__dialog" role="dialog" aria-labelledby="studio-debug-log-title" onClick={(e) => e.stopPropagation()}>
            <div className="studio-debug-log__header studio-debug-log__header--modal">
              <div className="studio-debug-log__title-wrap">
                <h2 id="studio-debug-log-title" className="studio-debug-log__title">Лог студии</h2>
                {logs.length > 0 ? <span className="studio-debug-log__count">{logs.length}</span> : null}
              </div>
              <div className="studio-debug-log__actions">
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
                <button
                  type="button"
                  className="studio-debug-log__close"
                  onClick={() => setLogsOpen(false)}
                >
                  Закрыть
                </button>
              </div>
            </div>
            <div className="studio-debug-log__body studio-debug-log__body--modal">
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
          </div>
        </div>
      ) : null}

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

      <ConfirmDialog
        open={stopConfirmOpen}
        title="Остановить эфир?"
        message="Текущий RTMP-поток будет остановлен. После подтверждения эфир можно будет запустить снова."
        confirmLabel="Остановить эфир"
        cancelLabel="Отмена"
        confirmLoading={liveBusy}
        onConfirm={() => void confirmStopLive()}
        onCancel={() => {
          if (!liveBusy) setStopConfirmOpen(false)
        }}
      />
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82L4.21 7.2a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
