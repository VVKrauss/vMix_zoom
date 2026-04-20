import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandLogoLoader } from './BrandLogoLoader'
import { useSoloViewer } from '../hooks/useSoloViewer'

interface Props {
  roomId: string
  watchPeerId: string
  onExit: () => void
}

/** Собираем один MediaStream: видео + аудио в одном элементе — так надёжнее для звука и автозапуска. */
function mergeAV(video: MediaStream | null, audio: MediaStream | null): MediaStream | null {
  const tracks: MediaStreamTrack[] = []
  if (video) {
    for (const t of video.getVideoTracks()) {
      if (t.readyState === 'live') tracks.push(t)
    }
  }
  if (audio) {
    for (const t of audio.getAudioTracks()) {
      if (t.readyState === 'live') tracks.push(t)
    }
  }
  if (!tracks.length) return null
  return new MediaStream(tracks)
}

export function SoloViewerPage({ roomId, watchPeerId, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenAudioRef = useRef<HTMLAudioElement>(null)

  const { status, error, videoStream, micAudioStream, screenAudioStream, camVideo, scrVideo, retry } =
    useSoloViewer(roomId, watchPeerId)

  const [micGain, setMicGain] = useState(1)
  const [screenGain, setScreenGain] = useState(0.15)

  const micKey = useMemo(() => `vmix:solo:mic:${roomId}:${watchPeerId}`, [roomId, watchPeerId])
  const screenKey = useMemo(() => `vmix:solo:screen:${roomId}:${watchPeerId}`, [roomId, watchPeerId])

  useEffect(() => {
    const raw = window.localStorage.getItem(micKey)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isFinite(n)) setMicGain(Math.max(0, Math.min(2, n)))
  }, [micKey])
  useEffect(() => {
    const raw = window.localStorage.getItem(screenKey)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isFinite(n)) setScreenGain(Math.max(0, Math.min(2, n)))
  }, [screenKey])
  useEffect(() => {
    window.localStorage.setItem(micKey, String(micGain))
  }, [micGain, micKey])
  useEffect(() => {
    window.localStorage.setItem(screenKey, String(screenGain))
  }, [screenGain, screenKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  useEffect(() => {
    document.documentElement.classList.add('app-root--room')
    return () => document.documentElement.classList.remove('app-root--room')
  }, [])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    if (status !== 'connected') {
      el.srcObject = null
      return
    }

    /* Сброс srcObject при смене трека — иначе Chromium часто оставляет чёрный кадр. */
    el.srcObject = null

    let cancelled = false
    const kick = async () => {
      const merged = mergeAV(videoStream, micAudioStream)
      if (cancelled || !el.isConnected) return
      el.srcObject = merged
      if (!merged) return
      /* Сначала без звука — иначе Chromium блокирует play() без жеста (чёрный экран). */
      el.muted = true
      try {
        await el.play()
      } catch {
        /* noop */
      }
      if (cancelled) return
      el.muted = false
      try {
        await el.play()
      } catch {
        /* звук останется до клика */
      }
    }
    void kick()

    return () => {
      cancelled = true
    }
  }, [status, videoStream, micAudioStream, camVideo, scrVideo])

  useEffect(() => {
    const el = screenAudioRef.current
    if (!el) return
    el.srcObject = null
    if (status !== 'connected' || !screenAudioStream) return
    el.srcObject = screenAudioStream
    el.volume = Math.max(0, Math.min(1, screenGain))
    void el.play().catch(() => {})
  }, [screenAudioStream, screenGain, status])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const el = videoRef.current
      if (!el?.srcObject) return
      void el.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (status === 'connecting') {
    return (
      <div className="solo-viewer-page solo-viewer-page--state">
        <div className="solo-viewer-state-inner">
          <BrandLogoLoader size={44} />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="solo-viewer-page solo-viewer-page--state">
        <div className="solo-viewer-state-inner solo-viewer-state-inner--msg">
          <p>{error ?? 'Ошибка подключения'}</p>
          <div className="solo-viewer-actions">
            <button type="button" className="solo-viewer-btn solo-viewer-btn--retry" onClick={retry}>
              Повторить
            </button>
            <button type="button" className="solo-viewer-btn solo-viewer-btn--back" onClick={onExit}>
              Назад
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'peer_left') {
    return (
      <div className="solo-viewer-page solo-viewer-page--state">
        <div className="solo-viewer-state-inner solo-viewer-state-inner--msg">
          <div className="solo-viewer-state-brand-mark" role="status" aria-label="Нет сигнала">
            <BrandLogoLoader size={96} />
          </div>
          <div className="solo-viewer-actions">
            <button type="button" className="solo-viewer-btn solo-viewer-btn--retry" onClick={retry}>
              Повторить
            </button>
            <button type="button" className="solo-viewer-btn solo-viewer-btn--back" onClick={onExit}>
              Назад
            </button>
          </div>
        </div>
      </div>
    )
  }

  const tryPlay = () => {
    const el = videoRef.current
    if (!el) return
    el.muted = false
    void el.play()
  }

  return (
    <div
      className="solo-viewer-page solo-viewer-page--live"
      onClick={tryPlay}
      role="presentation"
    >
      <video
        key={`solo-${camVideo?.id ?? 'c'}-${scrVideo?.id ?? 's'}`}
        ref={videoRef}
        className={
          videoStream || micAudioStream || screenAudioStream
            ? 'solo-viewer-fullvideo'
            : 'solo-viewer-fullvideo solo-viewer-fullvideo--empty'
        }
        autoPlay
        playsInline
        controls={false}
      />
      {screenAudioStream ? <audio ref={screenAudioRef} autoPlay playsInline /> : null}
      {(micAudioStream || screenAudioStream) ? (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            padding: 10,
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(10,8,7,0.65)',
            backdropFilter: 'blur(10px)',
            color: 'rgba(255,255,255,0.9)',
            width: 240,
          }}
          role="group"
          aria-label="Микшер звука"
        >
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Микшер</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
            <span>Микрофон</span>
            <span style={{ opacity: 0.7 }}>{Math.round(micGain * 100)}%</span>
          </div>
          <input type="range" min={0} max={200} value={Math.round(micGain * 100)} onChange={(e) => setMicGain(Number(e.target.value) / 100)} style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginTop: 8 }}>
            <span>Звук экрана</span>
            <span style={{ opacity: 0.7 }}>{Math.round(screenGain * 100)}%</span>
          </div>
          <input type="range" min={0} max={200} value={Math.round(screenGain * 100)} onChange={(e) => setScreenGain(Number(e.target.value) / 100)} style={{ width: '100%' }} />
        </div>
      ) : null}
      {!videoStream && !micAudioStream && !screenAudioStream && (
        <div className="solo-viewer-waiting" role="status" aria-label="Ожидание потока">
          <BrandLogoLoader size={96} />
        </div>
      )}
    </div>
  )
}
