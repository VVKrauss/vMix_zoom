import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type MirrorState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'running'; startedAtIso: string }
  | { status: 'error'; startedAtIso: string | null; error: { name: string; message: string; raw: string } }

function nowIso() {
  return new Date().toISOString()
}

function safeStringify(x: unknown): string {
  try {
    return JSON.stringify(x)
  } catch {
    return String(x)
  }
}

export function Test2Page() {
  const [state, setState] = useState<MirrorState>({ status: 'idle' })
  const [lastTrackInfo, setLastTrackInfo] = useState<Record<string, unknown> | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const v = videoRef.current
    if (v) {
      try {
        v.pause()
      } catch {
        /* noop */
      }
      try {
        ;(v as any).srcObject = null
      } catch {
        /* noop */
      }
      v.removeAttribute('src')
      try {
        v.load()
      } catch {
        /* noop */
      }
    }
    const s = streamRef.current
    streamRef.current = null
    if (s) {
      for (const t of s.getTracks()) {
        try {
          t.stop()
        } catch {
          /* noop */
        }
      }
    }
    startedAtRef.current = null
    setLastTrackInfo(null)
    setState({ status: 'idle' })
  }, [])

  const start = useCallback(async () => {
    stop()
    const startedAtIso = nowIso()
    startedAtRef.current = startedAtIso
    setState({ status: 'starting' })
    setLastTrackInfo(null)

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is not available')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream

      const track = stream.getVideoTracks()[0] ?? null
      const trackSettings = track?.getSettings?.() ?? null
      const trackConstraints = track?.getConstraints?.() ?? null
      setLastTrackInfo({
        trackLabel: track?.label ?? null,
        trackReadyState: track?.readyState ?? null,
        trackMuted: track?.muted ?? null,
        settings: trackSettings,
        constraints: trackConstraints,
      })

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) throw new Error('missing_video_or_canvas')

      video.playsInline = true
      video.muted = true
      video.autoplay = true
      ;(video as any).srcObject = stream

      // Some browsers require explicit play() in a user gesture handler.
      try {
        await video.play()
      } catch {
        // If play fails, we still might be able to draw frames once metadata is available.
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no_2d_context')

      setState({ status: 'running', startedAtIso })

      const draw = () => {
        const v = videoRef.current
        const c = canvasRef.current
        if (!v || !c) return
        const w = v.videoWidth || 0
        const h = v.videoHeight || 0
        if (w > 0 && h > 0) {
          if (c.width !== w) c.width = w
          if (c.height !== h) c.height = h
          try {
            ctx.drawImage(v, 0, 0, w, h)
          } catch {
            // drawImage can throw if the video isn't ready yet; keep looping.
          }
        }
        rafRef.current = requestAnimationFrame(draw)
      }

      rafRef.current = requestAnimationFrame(draw)
    } catch (e: any) {
      const name =
        typeof e?.name === 'string'
          ? e.name
          : e instanceof DOMException
            ? e.name
            : e instanceof Error
              ? 'Error'
              : 'UnknownError'
      const message =
        typeof e?.message === 'string'
          ? e.message
          : e instanceof DOMException
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e)
      const raw = safeStringify(e)
      setState({ status: 'error', startedAtIso: startedAtRef.current, error: { name, message, raw } })
    }
  }, [stop])

  useEffect(() => stop, [stop])

  const canStart = state.status === 'idle' || state.status === 'error'
  const canStop = state.status === 'starting' || state.status === 'running'

  const info = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false
    return { ua, isSecure }
  }, [])

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: '0 auto' }}>
      <h2 style={{ margin: '8px 0 12px' }}>/test2 — Camera mirror</h2>
      <div style={{ opacity: 0.85, fontSize: 14, lineHeight: 1.4 }}>
        <div><b>Secure context</b>: {String(info.isSecure)}</div>
        <div><b>User-Agent</b>: {info.ua}</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void start()}
          disabled={!canStart}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: '#1f6feb', color: 'white' }}
        >
          Start camera
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!canStop}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: '#30363d', color: 'white' }}
        >
          Stop
        </button>
        <div style={{ alignSelf: 'center', fontSize: 14, opacity: 0.85 }}>
          <b>Status</b>: {state.status}
          {state.status === 'running' ? ` (since ${state.startedAtIso})` : null}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            maxHeight: '70vh',
            background: '#0b0f14',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        />
        <video ref={videoRef} style={{ display: 'none' }} />
      </div>

      {state.status === 'error' ? (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.35)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>getUserMedia error</div>
          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            name: {state.error.name}{'\n'}
            message: {state.error.message}{'\n'}
            raw: {state.error.raw}
          </div>
        </div>
      ) : null}

      {lastTrackInfo ? (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'rgba(56,139,253,0.10)', border: '1px solid rgba(56,139,253,0.30)' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Track info</div>
          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {safeStringify(lastTrackInfo)}
          </div>
        </div>
      ) : null}
    </div>
  )
}

