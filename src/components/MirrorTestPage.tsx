import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getUserMediaAudioThenVideo,
  serializeMediaError,
  summarizeTrack,
} from '../utils/splitAvMediaStream'
import './MirrorTestPage.css'

const LOG_CAP = 500

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function safeConstraints(c: MediaStreamConstraints): unknown {
  try {
    return JSON.parse(JSON.stringify(c)) as unknown
  } catch {
    return { raw: String(c) }
  }
}

function deviceOptionLabel(d: MediaDeviceInfo): string {
  const t = (d.label || '').trim()
  if (t) return t
  return `${d.kind} ${d.deviceId.slice(0, 8)}…`
}

/** Не реальный deviceId — в getUserMedia передаём `audio: true`. */
const MIRROR_AUDIO_SYSTEM = '__system_default__'

function mirrorAudioPart(selected: string): boolean | MediaTrackConstraints {
  const t = selected.trim()
  if (!t || t === MIRROR_AUDIO_SYSTEM || t.toLowerCase() === 'default') return true
  return { deviceId: { ideal: t } }
}

/**
 * Тестовая страница «зеркало»: выбор камеры и микрофона, захват, подробный лог.
 */
export function MirrorTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const sessionT0Ref = useRef(Date.now())
  const appendRef = useRef<(msg: string, detail?: Record<string, unknown>) => void>(() => {})

  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(false)
  const [logLines, setLogLines] = useState<string[]>([])

  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([])
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState('')
  const [selectedAudioId, setSelectedAudioId] = useState(MIRROR_AUDIO_SYSTEM)
  const [devicesBusy, setDevicesBusy] = useState(false)

  const append = useCallback((msg: string, detail?: Record<string, unknown>) => {
    const rel = Date.now() - sessionT0Ref.current
    const suffix = detail !== undefined ? ` ${safeJson(detail)}` : ''
    const line = `[+${rel}ms] ${msg}${suffix}`
    console.log('[mirror]', msg, detail ?? '')
    setLogLines((prev) => [...prev.slice(-(LOG_CAP - 1)), line])
  }, [])

  appendRef.current = append

  const logDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      append('devices:enumerate', {
        count: list.length,
        videoinput: list.filter((d) => d.kind === 'videoinput').length,
        audioinput: list.filter((d) => d.kind === 'audioinput').length,
        audiooutput: list.filter((d) => d.kind === 'audiooutput').length,
        withLabel: list.filter((d) => Boolean(d.label?.trim())).length,
      })
    } catch (e) {
      append('devices:enumerate_fail', serializeMediaError(e))
    }
  }, [append])

  const refreshDeviceLists = useCallback(async () => {
    setDevicesBusy(true)
    try {
      let list = await navigator.mediaDevices.enumerateDevices()
      const videoRaw = list.filter((d) => d.kind === 'videoinput')
      const needDeviceIds = videoRaw.some((d) => !d.deviceId?.trim())
      if (needDeviceIds) {
        append('devices:prime_gum', {
          reason: 'empty_device_id_until_permission',
          videoinputCount: videoRaw.length,
        })
        try {
          const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          tmp.getTracks().forEach((t) => {
            try {
              t.stop()
            } catch {
              /* noop */
            }
          })
          list = await navigator.mediaDevices.enumerateDevices()
          append('devices:prime_gum_ok', {})
        } catch (e) {
          append('devices:prime_gum_fail', serializeMediaError(e))
        }
      }

      const v = list.filter((d) => d.kind === 'videoinput' && d.deviceId?.trim())
      const a = list.filter(
        (d) => d.kind === 'audioinput' && d.deviceId?.trim() && d.deviceId.toLowerCase() !== 'default',
      )
      setVideoInputs(v)
      setAudioInputs(a)
      setSelectedVideoId((prev) => (prev && v.some((x) => x.deviceId === prev) ? prev : ''))
      setSelectedAudioId((prev) => {
        if (prev === MIRROR_AUDIO_SYSTEM) return prev
        return prev && a.some((x) => x.deviceId === prev) ? prev : MIRROR_AUDIO_SYSTEM
      })
      append('devices:list_refreshed', { videoCount: v.length, audioCount: a.length })
      await logDevices()
    } catch (e) {
      append('devices:list_refresh_fail', serializeMediaError(e))
    } finally {
      setDevicesBusy(false)
    }
  }, [append, logDevices])

  const logPermissions = useCallback(async () => {
    const q = navigator.permissions?.query?.bind(navigator.permissions)
    if (!q) {
      append('perm:api', { supported: false })
      return
    }
    for (const name of ['camera', 'microphone'] as const) {
      try {
        const status = await q({ name: name as PermissionName })
        append(`perm:${name}`, { state: status.state })
      } catch (e) {
        append(`perm:${name}`, { query: 'failed', ...serializeMediaError(e) })
      }
    }
  }, [append])

  const gumLogged = useCallback(
    async (label: string, constraints: MediaStreamConstraints): Promise<MediaStream> => {
      const t0 = performance.now()
      append(`${label}:gum_start`, { constraints: safeConstraints(constraints) })
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        append(`${label}:gum_ok`, {
          ms: Math.round(performance.now() - t0),
          tracks: stream.getTracks().map(summarizeTrack),
        })
        return stream
      } catch (e) {
        append(`${label}:gum_fail`, {
          ms: Math.round(performance.now() - t0),
          error: serializeMediaError(e),
          constraints: safeConstraints(constraints),
        })
        throw e
      }
    },
    [append],
  )

  useEffect(() => {
    sessionT0Ref.current = Date.now()
    append('session:mount', {
      userAgent: navigator.userAgent,
      protocol: location.protocol,
      host: location.host,
      isSecureContext: window.isSecureContext,
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    })
    void logPermissions()
    void refreshDeviceLists()
  }, [append, logPermissions, refreshDeviceLists])

  useEffect(() => {
    const onVis = () => {
      appendRef.current('doc:visibilitychange', {
        visibilityState: document.visibilityState,
        hidden: document.hidden,
      })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    const onDeviceChange = () => {
      void refreshDeviceLists()
    }
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
  }, [refreshDeviceLists])

  const stop = useCallback(() => {
    const had = Boolean(streamRef.current?.getTracks().length)
    streamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop()
      } catch {
        /* noop */
      }
    })
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
    setActive(false)
    setError(null)
    append('capture:stop', { hadTracks: had })
  }, [append])

  const start = useCallback(async () => {
    if (!selectedVideoId.trim()) {
      append('capture:start_blocked', { reason: 'select_camera' })
      return
    }
    if (!selectedAudioId.trim()) {
      append('capture:start_blocked', { reason: 'select_mic_or_system' })
      return
    }

    setError(null)
    stop()
    const audioPart = mirrorAudioPart(selectedAudioId)
    append('capture:start_click', {
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      videoDeviceId8: selectedVideoId.slice(0, 8),
      audioMode: audioPart === true ? 'system_default' : 'explicit_device',
      audioDeviceId8: audioPart === true ? null : selectedAudioId.slice(0, 8),
    })
    await logDevices()
    await logPermissions()

    const videoConstraints: MediaTrackConstraints = {
      deviceId: { ideal: selectedVideoId.trim() },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 15, max: 30 },
    }

    try {
      let stream: MediaStream
      try {
        append('strategy:1_split', {
          video: 'explicit_device',
          audio: audioPart === true ? 'system_default' : 'explicit_device',
        })
        stream = await getUserMediaAudioThenVideo(audioPart, videoConstraints, (phase, detail) => {
          append(`split:${phase}`, detail)
        })
      } catch (e1) {
        append('strategy:1_split_failed', { error: serializeMediaError(e1) })
        try {
          append('strategy:2_combined_soft', {})
          stream = await gumLogged('soft', {
            audio: audioPart,
            video: {
              deviceId: { ideal: selectedVideoId.trim() },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 24, max: 30 },
            },
          })
        } catch (e2) {
          append('strategy:2_combined_soft_failed', { error: serializeMediaError(e2) })
          append('strategy:3_combined_true', {})
          stream = await gumLogged('hard', {
            audio: audioPart,
            video: { deviceId: { ideal: selectedVideoId.trim() } },
          })
        }
      }

      streamRef.current = stream
      append('capture:stream_ready', {
        tracks: stream.getTracks().map(summarizeTrack),
      })

      const v = videoRef.current
      if (v) {
        v.srcObject = stream
        v.muted = true
        const tPlay = performance.now()
        try {
          await v.play()
          append('video:play_ok', { ms: Math.round(performance.now() - tPlay) })
        } catch (pe) {
          append('video:play_fail', serializeMediaError(pe))
        }
      } else {
        append('video:ref_missing', {})
      }
      setActive(true)
      append('capture:success', {})
    } catch (e) {
      const msg =
        e instanceof DOMException
          ? `${e.name}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e)
      append('capture:final_fail', { message: msg, error: serializeMediaError(e) })
      setError(msg)
      setActive(false)
    }
  }, [
    append,
    gumLogged,
    logDevices,
    logPermissions,
    selectedAudioId,
    selectedVideoId,
    stop,
  ])

  useEffect(() => () => stop(), [stop])

  const copyLog = useCallback(async () => {
    const text = logLines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      append('ui:log_copied', { chars: text.length })
    } catch (e) {
      append('ui:log_copy_fail', serializeMediaError(e))
    }
  }, [append, logLines])

  const clearLog = useCallback(() => {
    setLogLines([])
    sessionT0Ref.current = Date.now()
    append('ui:log_cleared', {})
  }, [append])

  const canStart = Boolean(selectedVideoId.trim() && selectedAudioId.trim() && !active)

  return (
    <div className="mirror-test">
      <header className="mirror-test__header">
        <h1 className="mirror-test__title">Зеркало (тест)</h1>
        <p className="mirror-test__hint">
          До первого доступа к камере/микрофону браузер часто не отдаёт <code>deviceId</code> — при «Обновить список»
          выполняется короткий запрос getUserMedia, после чего в списке появляются реальные камеры. Лог — в консоль (
          <code>[mirror]</code>) и ниже.
        </p>
        <Link to="/" className="mirror-test__back">
          На главную
        </Link>
      </header>

      <div className="mirror-test__pickers">
        <div className="mirror-test__field">
          <label className="mirror-test__label" htmlFor="mirror-video">
            Камера
          </label>
          <select
            id="mirror-video"
            className="mirror-test__select"
            value={selectedVideoId}
            onChange={(e) => setSelectedVideoId(e.target.value)}
            disabled={active || devicesBusy}
          >
            <option value="">— выберите —</option>
            {videoInputs.map((d, idx) => (
              <option key={d.deviceId || `${d.groupId}-${idx}`} value={d.deviceId}>
                {deviceOptionLabel(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="mirror-test__field">
          <label className="mirror-test__label" htmlFor="mirror-audio">
            Микрофон
          </label>
          <select
            id="mirror-audio"
            className="mirror-test__select"
            value={selectedAudioId}
            onChange={(e) => setSelectedAudioId(e.target.value)}
            disabled={active || devicesBusy}
          >
            <option value={MIRROR_AUDIO_SYSTEM}>Системный микрофон (audio: true)</option>
            {audioInputs.map((d, idx) => (
              <option key={d.deviceId || `${d.groupId}-${idx}`} value={d.deviceId}>
                {deviceOptionLabel(d)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="mirror-test__btn"
          onClick={() => void refreshDeviceLists()}
          disabled={active || devicesBusy}
        >
          {devicesBusy ? 'Список…' : 'Обновить список'}
        </button>
      </div>
      {!devicesBusy && videoInputs.length === 0 ? (
        <p className="mirror-test__notice" role="status">
          Камер в списке нет: нажмите «Обновить список» (будет запрос доступа) или проверьте лог —{' '}
          <code>devices:prime_gum_fail</code>.
        </p>
      ) : null}

      <div className="mirror-test__controls">
        <button type="button" className="mirror-test__btn" onClick={() => void start()} disabled={!canStart}>
          Запустить захват
        </button>
        <button type="button" className="mirror-test__btn mirror-test__btn--danger" onClick={stop} disabled={!active}>
          Остановить
        </button>
        <button type="button" className="mirror-test__btn" onClick={copyLog} disabled={logLines.length === 0}>
          Копировать лог
        </button>
        <button type="button" className="mirror-test__btn" onClick={clearLog}>
          Очистить лог
        </button>
      </div>
      {error ? (
        <p className="mirror-test__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mirror-test__stage">
        <video ref={videoRef} className="mirror-test__video" playsInline autoPlay />
      </div>
      <section className="mirror-test__log" aria-label="Журнал захвата">
        <div className="mirror-test__log-title">Журнал ({logLines.length} строк)</div>
        <pre className="mirror-test__log-body">{logLines.join('\n') || '— выберите устройства и нажмите «Запустить захват» —'}</pre>
      </section>
    </div>
  )
}
