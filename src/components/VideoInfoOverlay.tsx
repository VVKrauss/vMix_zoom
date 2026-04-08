import { useEffect, useRef, useState } from 'react'
import type { InboundVideoQuality } from '../utils/inboundVideoStats'
import { buildSoloViewerAbsoluteUrl } from '../utils/soloViewerParams'

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

function formatMbps(bps: number): string {
  if (!Number.isFinite(bps) || bps < 0) return '—'
  return (bps / 1_000_000).toFixed(2)
}

function formatPct01(x: number): string {
  if (!Number.isFinite(x)) return '—'
  return `${Math.round(x * 1000) / 10}%`
}

export function VideoInfoOverlay({
  stream,
  videoRef,
  roomId,
  peerId,
  srtConnectUrl,
  linkQuality,
  showSoloViewerCopy = true,
}: {
  stream: MediaStream | null
  videoRef: React.RefObject<HTMLVideoElement>
  roomId?: string
  peerId?: string
  /** connectUrlPublic для vMix SRT Caller */
  srtConnectUrl?: string
  /** Приём входящего видео (getStats), только в режиме инфо для удалённых плиток. */
  linkQuality?: InboundVideoQuality | null
  /** Показывать кнопку соло-ссылки (стример / админы). */
  showSoloViewerCopy?: boolean
}) {
  const [info, setInfo] = useState<VideoInfo | null>(null)
  const [copiedPeer, setCopiedPeer] = useState(false)
  const [copiedSrt, setCopiedSrt] = useState(false)
  const [copiedSolo, setCopiedSolo] = useState(false)
  const timerRef = useRef<number>(0)
  const copyFlashRef = useRef<number>(0)
  const copySrtFlashRef = useRef<number>(0)
  const copySoloFlashRef = useRef<number>(0)

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

  const copySoloPageUrl = () => {
    if (!roomId || !peerId) return
    void navigator.clipboard.writeText(buildSoloViewerAbsoluteUrl(roomId, peerId)).then(
      () => {
        setCopiedSolo(true)
        window.clearTimeout(copySoloFlashRef.current)
        copySoloFlashRef.current = window.setTimeout(() => setCopiedSolo(false), 1500)
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
      window.clearTimeout(copySoloFlashRef.current)
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
      {showSoloViewerCopy && roomId && peerId ? (
        <button
          type="button"
          className="vio-row vio-row--peer"
          onClick={e => { e.stopPropagation(); copySoloPageUrl() }}
          title="Ссылка на отдельное окно просмотра этого участника"
        >
          <span className="vio-key">Соло-страница</span>
          <span className="vio-val vio-val--mono vio-val--id">
            {copiedSolo ? 'Скопировано' : 'Копировать ссылку на окно'}
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
      {linkQuality ? (
        <>
          <span className="vio-row">
            <span className="vio-key">Видео к серверу</span>
            <span className="vio-val">{formatMbps(linkQuality.bitrateBps)} Мбит/с</span>
          </span>
          <span className="vio-row">
            <span className="vio-key">Потери RTP</span>
            <span className="vio-val">{formatPct01(linkQuality.fractionLost)}</span>
          </span>
          <span className="vio-row">
            <span className="vio-key">Jitter</span>
            <span className="vio-val">
              {linkQuality.jitterMs != null && Number.isFinite(linkQuality.jitterMs)
                ? `${Math.round(linkQuality.jitterMs)} мс`
                : '—'}
            </span>
          </span>
          <span className="vio-row">
            <span className="vio-key">Уровень</span>
            <span className="vio-val">{linkQuality.level} / 5</span>
          </span>
        </>
      ) : null}
    </div>
  )
}
