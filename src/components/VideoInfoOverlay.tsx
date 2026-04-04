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

function truncateUrl(s: string, max = 36): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

export function VideoInfoOverlay({
  stream,
  videoRef,
  roomId,
  peerId,
  srtConnectUrl,
}: {
  stream: MediaStream | null
  videoRef: React.RefObject<HTMLVideoElement>
  roomId?: string
  peerId?: string
  /** connectUrlPublic для vMix SRT Caller */
  srtConnectUrl?: string
}) {
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [copiedPeer, setCopiedPeer] = useState(false)
  const [copiedSrt, setCopiedSrt] = useState(false)
  const timerRef = useRef<number>(0)
  const copyFlashRef = useRef<number>(0)
  const copySrtFlashRef = useRef<number>(0)

  const copyPeerId = () => {
    if (!peerId) return
    void navigator.clipboard.writeText(peerId).then(
      () => {
        setCopiedPeer(true)
        window.clearTimeout(copyFlashRef.current)
        copyFlashRef.current = window.setTimeout(() => setCopiedPeer(false), 1500)
      },
      () => { /* clipboard API недоступен (не HTTPS и т.п.) */ },
    )
  }

  const copySrtUrl = () => {
    if (!srtConnectUrl) return
    void navigator.clipboard.writeText(srtConnectUrl).then(
      () => {
        setCopiedSrt(true)
        window.clearTimeout(copySrtFlashRef.current)
        copySrtFlashRef.current = window.setTimeout(() => setCopiedSrt(false), 1500)
      },
      () => {},
    )
  }

  useEffect(() => {
    const update = () => {
      if (!stream) { setInfo(null); return }

      const tracks = stream.getVideoTracks()
      if (!tracks.length) { setInfo(null); return }

      const track    = tracks[0]
      const settings = track.getSettings()
      const el       = videoRef.current

      const w  = el?.videoWidth  || settings.width  || 0
      const h  = el?.videoHeight || settings.height || 0
      const fr = settings.frameRate ?? 0

      setInfo({
        width:       w,
        height:      h,
        frameRate:   Math.round(fr),
        aspectRatio: calcAspect(w, h),
        codec:       'H.264',
        label:       track.label || 'Камера',
      })
    }

    update()
    timerRef.current = window.setInterval(update, 1000)
    return () => {
      clearInterval(timerRef.current)
      window.clearTimeout(copyFlashRef.current)
      window.clearTimeout(copySrtFlashRef.current)
    }
  }, [stream, videoRef])

  const hasMeta = Boolean(roomId || peerId || srtConnectUrl)
  if (!hasMeta && !info) return null

  return (
    <div className="video-info-overlay">
      {roomId ? (
        <span className="vio-row">
          <span className="vio-key">Комната</span>
          <span className="vio-val vio-val--mono">{roomId}</span>
        </span>
      ) : null}
      {peerId ? (
        <button
          type="button"
          className="vio-row vio-row--peer"
          onClick={e => { e.stopPropagation(); copyPeerId() }}
          title="Скопировать peerId"
        >
          <span className="vio-key">peerId</span>
          <span className="vio-val vio-val--mono vio-val--id">
            {copiedPeer ? 'Скопировано' : peerId}
          </span>
        </button>
      ) : null}
      {srtConnectUrl ? (
        <button
          type="button"
          className="vio-row vio-row--peer"
          onClick={e => { e.stopPropagation(); copySrtUrl() }}
          title="Скопировать SRT URL (vMix Caller)"
        >
          <span className="vio-key">SRT</span>
          <span className="vio-val vio-val--mono vio-val--id">
            {copiedSrt ? 'Скопировано' : truncateUrl(srtConnectUrl)}
          </span>
        </button>
      ) : null}
      {info ? (
        <>
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
        </>
      ) : null}
    </div>
  )
}
