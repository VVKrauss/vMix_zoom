import { useEffect, useRef, type ReactNode } from 'react'
import { BrandLogoLoader } from './BrandLogoLoader'
import { useSoloViewer } from '../hooks/useSoloViewer'

interface Props {
  roomId: string
  watchPeerId: string
  onExit: () => void
}

/** Собираем один MediaStream: видео + аудио в одном элементе — так надёжнее для звука и автозапуска. */
function SoloViewerStateTopLogo({ onExit }: { onExit: () => void }) {
  return (
    <div className="solo-viewer-state-topbar">
      <button type="button" className="room-logo-btn" onClick={onExit} title="Главная" aria-label="Главная">
        <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
      </button>
    </div>
  )
}

function SoloViewerStateLayout({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  return (
    <>
      <SoloViewerStateTopLogo onExit={onExit} />
      {children}
    </>
  )
}

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

  const { status, error, videoStream, audioStream, camVideo, scrVideo, retry } = useSoloViewer(roomId, watchPeerId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

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
      const merged = mergeAV(videoStream, audioStream)
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
  }, [status, videoStream, audioStream, camVideo, scrVideo])

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
        <SoloViewerStateLayout onExit={onExit}>
          <div className="solo-viewer-state-inner solo-viewer-state-inner--msg">
            <p>{error ?? 'Ошибка подключения'}</p>
            <div className="solo-viewer-actions">
              <button type="button" className="solo-viewer-btn" onClick={retry}>
                Повторить
              </button>
              <button type="button" className="solo-viewer-btn solo-viewer-btn--ghost" onClick={onExit}>
                Назад
              </button>
            </div>
          </div>
        </SoloViewerStateLayout>
      </div>
    )
  }

  if (status === 'peer_left') {
    return (
      <div className="solo-viewer-page solo-viewer-page--state">
        <SoloViewerStateLayout onExit={onExit}>
          <div className="solo-viewer-state-inner solo-viewer-state-inner--msg">
            <p>Нет сигнала</p>
            <div className="solo-viewer-actions">
              <button type="button" className="solo-viewer-btn" onClick={retry}>
                Повторить
              </button>
              <button type="button" className="solo-viewer-btn solo-viewer-btn--ghost" onClick={onExit}>
                Назад
              </button>
            </div>
          </div>
        </SoloViewerStateLayout>
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
        className={videoStream || audioStream ? 'solo-viewer-fullvideo' : 'solo-viewer-fullvideo solo-viewer-fullvideo--empty'}
        autoPlay
        playsInline
        controls={false}
      />
      {!videoStream && !audioStream && (
        <div className="solo-viewer-waiting">Ожидание потока…</div>
      )}
    </div>
  )
}
