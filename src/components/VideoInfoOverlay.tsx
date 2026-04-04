import { useEffect, useRef, useState } from 'react'

interface VideoInfo {
  width:       number
  height:      number
  frameRate:   number
  aspectRatio: string
  codec:       string
  label:       string
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function calcAspect(w: number, h: number): string {
  if (!w || !h) return '—'
  const d = gcd(w, h)
  return `${w / d}:${h / d}`
}

export function VideoInfoOverlay({
  stream,
  videoRef,
}: {
  stream: MediaStream | null
  videoRef: React.RefObject<HTMLVideoElement>
}) {
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const timerRef = useRef<number>(0)

  useEffect(() => {
    const update = () => {
      if (!stream) { setInfo(null); return }

      const tracks = stream.getVideoTracks()
      if (!tracks.length) { setInfo(null); return }

      const track    = tracks[0]
      const settings = track.getSettings()
      const el       = videoRef.current

      // Prefer element's intrinsic dimensions (actual decoded frame size)
      const w  = el?.videoWidth  || settings.width  || 0
      const h  = el?.videoHeight || settings.height || 0
      const fr = settings.frameRate ?? 0

      setInfo({
        width:       w,
        height:      h,
        frameRate:   Math.round(fr),
        aspectRatio: calcAspect(w, h),
        codec:       'H.264',          // WebRTC always H.264 or VP8/VP9 — getSettings() doesn't expose codec
        label:       track.label || 'Камера',
      })
    }

    update()
    timerRef.current = window.setInterval(update, 1000)
    return () => clearInterval(timerRef.current)
  }, [stream, videoRef])

  if (!info) return null

  return (
    <div className="video-info-overlay">
      <span className="vio-row">
        <span className="vio-key">Разрешение</span>
        <span className="vio-val">{info.width} × {info.height}</span>
      </span>
      <span className="vio-row">
        <span className="vio-key">Соотношение</span>
        <span className="vio-val">{info.aspectRatio}</span>
      </span>
      <span className="vio-row">
        <span className="vio-key">Частота</span>
        <span className="vio-val">{info.frameRate} fps</span>
      </span>
      <span className="vio-row">
        <span className="vio-key">Источник</span>
        <span className="vio-val vio-val--label">{info.label}</span>
      </span>
    </div>
  )
}
