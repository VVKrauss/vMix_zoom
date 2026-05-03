/**
 * Два последовательных getUserMedia вместо одного combined — на части связок
 * Windows + драйвер камеры + Chromium/Edge один запрос «аудио+видео» долго висит и даёт
 * AbortError «Timeout starting video source»; раздельный старт часто проходит.
 */
export type AvSplitDebugLog = (phase: string, detail?: Record<string, unknown>) => void

type VideoSplitStep = { label: string; constraints: MediaTrackConstraints | true }

function pickDeviceIdStringFromField(
  field: ConstrainDOMString | ConstrainDOMString[] | undefined,
): string | null {
  if (field == null) return null
  if (typeof field === 'string') {
    const t = field.trim()
    return t || null
  }
  if (typeof field === 'object' && !Array.isArray(field)) {
    const o = field as { ideal?: string; exact?: string }
    if (typeof o.ideal === 'string') {
      const t = o.ideal.trim()
      return t || null
    }
    if (typeof o.exact === 'string') {
      const t = o.exact.trim()
      return t || null
    }
  }
  return null
}

function pickDeviceIdFromVideoConstraints(c: MediaTrackConstraints): string | null {
  return pickDeviceIdStringFromField(c.deviceId)
}

function hasVideoConstraintsBeyondDeviceId(c: MediaTrackConstraints): boolean {
  for (const k of Object.keys(c) as (keyof MediaTrackConstraints)[]) {
    if (k === 'deviceId') continue
    const v = c[k]
    if (v !== undefined && v !== null && v !== false) return true
  }
  return false
}

/**
 * `deviceId: { ideal: "default" }` ломает/путает Chromium — для системного микрофона нужен `audio: true`.
 */
export function normalizeAudioForGetUserMedia(
  audio: boolean | MediaTrackConstraints,
): boolean | MediaTrackConstraints {
  if (typeof audio === 'boolean') return audio
  const id = pickDeviceIdStringFromField(audio.deviceId)
  if (id?.toLowerCase() === 'default') return true
  return audio
}

/**
 * Если видео передано как `true` (без deviceId) — только общая лестница без перебора устройств.
 * Явный выбор камеры: передавайте `MediaTrackConstraints` с `deviceId`.
 */
function videoTrueDefaultSteps(): VideoSplitStep[] {
  return [
    {
      label: 'soft_640x480_15fps',
      constraints: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15, max: 30 },
      },
    },
    {
      label: 'soft_854x480_24fps',
      constraints: {
        width: { ideal: 854 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
      },
    },
    {
      label: 'lo_320x240',
      constraints: {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { max: 15 },
      },
    },
    { label: 'facing_user', constraints: { facingMode: { ideal: 'user' } } },
    { label: 'video_true', constraints: true },
  ]
}

async function openVideoForSplit(
  video: boolean | MediaTrackConstraints,
  L: AvSplitDebugLog,
): Promise<MediaStream> {
  let steps: VideoSplitStep[]
  if (video === true) {
    L('video_steps', { note: 'generic_only_no_device_enumeration' })
    steps = videoTrueDefaultSteps()
  } else {
    const c = video as MediaTrackConstraints
    const vid = pickDeviceIdFromVideoConstraints(c)
    if (
      vid &&
      vid.toLowerCase() !== 'default' &&
      c.deviceId != null &&
      hasVideoConstraintsBeyondDeviceId(c)
    ) {
      steps = [
        { label: 'caller_plain_device', constraints: { deviceId: c.deviceId } },
        { label: 'caller', constraints: c },
      ]
    } else {
      steps = [{ label: 'caller', constraints: c }]
    }
  }

  const tAll = performance.now()
  let lastErr: unknown
  for (const step of steps) {
    const t0 = performance.now()
    L('video_try_start', {
      label: step.label,
      video: step.constraints === true ? true : summarizeConstraintsVideo(step.constraints),
    })
    try {
      const v = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: step.constraints,
      })
      L('video_try_ok', {
        label: step.label,
        ms: Math.round(performance.now() - t0),
        msSinceVideoPhase: Math.round(performance.now() - tAll),
        tracks: v.getVideoTracks().map(summarizeTrack),
      })
      return v
    } catch (e) {
      lastErr = e
      L('video_try_fail', {
        label: step.label,
        ms: Math.round(performance.now() - t0),
        error: serializeMediaError(e),
      })
    }
  }
  L('video_all_tries_failed', {
    msTotal: Math.round(performance.now() - tAll),
    tries: steps.length,
    lastError: lastErr ? serializeMediaError(lastErr) : null,
  })
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function stopTracksQuiet(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => {
    try {
      t.stop()
    } catch {
      /* noop */
    }
  })
}

/**
 * Сначала только видео (лестница), потом аудио — на Edge+Windows иногда после USB/ASIO-микрофона
 * (напр. QUAD-CAPTURE) дефолтная камера не стартует до таймаута; Chrome может выбрать другой дефолтный микрофон.
 */
async function tryVideoFirstThenAudio(
  audio: boolean | MediaTrackConstraints,
  video: boolean | MediaTrackConstraints,
  L: AvSplitDebugLog,
): Promise<MediaStream> {
  const vf = (phase: string, detail?: Record<string, unknown>) => L(`vf.${phase}`, detail ?? {})
  const tV0 = performance.now()
  vf('order', { note: 'video_first_then_audio' })
  const vStream = await openVideoForSplit(video, vf)
  vf('video_stream_ok', { ms: Math.round(performance.now() - tV0) })
  const tA0 = performance.now()
  vf('audio_gum_start', { audio: summarizeConstraintsAudio(audio) })
  try {
    const aStream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
    vf('audio_gum_ok', {
      ms: Math.round(performance.now() - tA0),
      tracks: aStream.getAudioTracks().map(summarizeTrack),
    })
    return new MediaStream([...vStream.getVideoTracks(), ...aStream.getAudioTracks()])
  } catch (e) {
    vf('audio_gum_fail', {
      ms: Math.round(performance.now() - tA0),
      error: serializeMediaError(e),
    })
    stopTracksQuiet(vStream)
    throw e
  }
}

/**
 * Ранее: сначала микрофон, потом видео. Оставляем как fallback после video-first.
 */
async function tryAudioFirstThenVideo(
  audio: boolean | MediaTrackConstraints,
  video: boolean | MediaTrackConstraints,
  L: AvSplitDebugLog,
): Promise<MediaStream> {
  const af = (phase: string, detail?: Record<string, unknown>) => L(`af.${phase}`, detail ?? {})
  const tAudio0 = performance.now()
  af('order', { note: 'audio_first_then_video' })
  af('audio_gum_start', { audio: summarizeConstraintsAudio(audio) })
  const a = await navigator.mediaDevices.getUserMedia({ audio, video: false })
  af('audio_gum_ok', {
    ms: Math.round(performance.now() - tAudio0),
    tracks: a.getAudioTracks().map(summarizeTrack),
  })
  const tVideo0 = performance.now()
  try {
    const v = await openVideoForSplit(video, af)
    af('video_phase_ok', {
      ms: Math.round(performance.now() - tVideo0),
      tracks: v.getVideoTracks().map(summarizeTrack),
    })
    return new MediaStream([...a.getAudioTracks(), ...v.getVideoTracks()])
  } catch (e) {
    af('video_phase_fail', {
      ms: Math.round(performance.now() - tVideo0),
      error: serializeMediaError(e),
    })
    stopTracksQuiet(a)
    throw e
  }
}

export async function getUserMediaAudioThenVideo(
  audio: boolean | MediaTrackConstraints,
  video: boolean | MediaTrackConstraints,
  debugLog?: AvSplitDebugLog,
): Promise<MediaStream> {
  const L = debugLog ?? (() => {})
  const audioNorm = normalizeAudioForGetUserMedia(audio)
  L('strategy', { tryOrder: ['video_first', 'audio_first'], audioNormalized: audioNorm === true })
  try {
    return await tryVideoFirstThenAudio(audioNorm, video, L)
  } catch (e1) {
    L('video_first_order_failed', { error: serializeMediaError(e1) })
    return await tryAudioFirstThenVideo(audioNorm, video, L)
  }
}

function summarizeConstraintsAudio(audio: boolean | MediaTrackConstraints): unknown {
  if (typeof audio === 'boolean') return { audio }
  return { audio: { ...audio, deviceId: redactDeviceId(audio.deviceId) } }
}

function summarizeConstraintsVideo(video: boolean | MediaTrackConstraints): unknown {
  if (typeof video === 'boolean') return { video }
  return { video: { ...video, deviceId: redactDeviceId(video.deviceId) } }
}

function redactDeviceId(
  d: ConstrainDOMString | ConstrainDOMString[] | undefined,
): ConstrainDOMString | ConstrainDOMString[] | undefined {
  if (d == null) return d
  if (typeof d === 'string') return `${d.slice(0, 8)}…`
  if (typeof d === 'object' && d !== null && 'exact' in d && typeof (d as { exact?: string }).exact === 'string') {
    const ex = (d as { exact: string }).exact
    return { ...d, exact: `${ex.slice(0, 8)}…` }
  }
  if (typeof d === 'object' && d !== null && 'ideal' in d && typeof (d as { ideal?: string }).ideal === 'string') {
    const id = (d as { ideal: string }).ideal
    return { ...d, ideal: `${id.slice(0, 8)}…` }
  }
  return '[object]'
}

export function summarizeTrack(t: MediaStreamTrack): Record<string, unknown> {
  let settings: MediaTrackSettings | Record<string, string> = {}
  try {
    settings = t.getSettings()
  } catch {
    settings = { error: 'getSettings_failed' }
  }
  return {
    kind: t.kind,
    label: t.label || '(empty)',
    id: t.id ? `${t.id.slice(0, 10)}…` : '',
    readyState: t.readyState,
    muted: t.muted,
    enabled: t.enabled,
    settings,
  }
}

export function serializeMediaError(e: unknown): Record<string, unknown> {
  if (e instanceof DOMException) {
    return {
      type: 'DOMException',
      name: e.name,
      message: e.message,
      code: e.code,
    }
  }
  if (e instanceof Error) {
    return {
      type: 'Error',
      name: e.name,
      message: e.message,
      stack: e.stack?.split('\n').slice(0, 4).join('\n'),
    }
  }
  return { type: typeof e, value: String(e) }
}
