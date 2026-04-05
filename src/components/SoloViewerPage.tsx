import { useEffect, useRef } from 'react'
import { useSoloViewer } from '../hooks/useSoloViewer'

interface Props {
  roomId: string
  watchPeerId: string
  onExit: () => void
}

/** Собираем один MediaStream: видео + аудио в одном элементе — так надёжнее для звука и автозапуска. */
function mergeAV(video: MediaStream | null, audio: MediaStream | null): MediaStream | null {
  const tracks: MediaStreamTrack[] = []
  if (video) tracks.push(...video.getVideoTracks())
  if (audio) tracks.push(...audio.getAudioTracks())
  if (!tracks.length) return null
  return new MediaStream(tracks)
}

export function SoloViewerPage({ roomId, watchPeerId, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const { status, error, videoStream, audioStream, retry } = useSoloViewer(roomId, watchPeerId)

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

    const merged = mergeAV(videoStream, audioStream)
    el.srcObject = merged
    el.muted = false

    void el.play().catch(() => {
      /* автозапуск со звуком может блокироваться — повтор после жеста пользователя */
    })
  }, [status, videoStream, audioStream])

  if (status === 'connecting') {
    return (
      <div className="solo-viewer-page solo-viewer-page--state">
        <div className="solo-viewer-state-inner">
          <div className="spinner" />
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
            <button type="button" className="solo-viewer-btn" onClick={retry}>
              Повторить
            </button>
            <button type="button" className="solo-viewer-btn solo-viewer-btn--ghost" onClick={onExit}>
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
      </div>
    )
  }

  const tryPlay = () => {
    void videoRef.current?.play()
  }

  return (
    <div
      className="solo-viewer-page solo-viewer-page--live"
      onClick={tryPlay}
      role="presentation"
    >
      <video
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
