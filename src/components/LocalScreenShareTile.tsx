import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { SrtCopySurface, type SrtCopyMenuExtraItem } from './SrtCopyMenu'
import { VideoInfoOverlay } from './VideoInfoOverlay'
import type { RoomReactionBurst } from '../types/roomComms'
import { ReactionBurstOverlay } from './ReactionBurstOverlay'
import { useBindPlayout } from '../hooks/useMediaPlayout'

interface Props {
  stream: MediaStream
  /** Отдельный входящий звук демонстрации (variant A). */
  audioStream?: MediaStream | null
  /** Подпись в полоске (например имя + «экран») */
  label: string
  roomId: string
  /**
   * Отдельный peerId продюсера экрана (с бэка / `screenPeerId` в ack produce).
   * Только он попадает в соло-URL и «скопировать peerId»; без него эти пункты скрыты
   * (не подставляем id камеры — иначе ссылка совпадает с плиткой гостя).
   */
  linkPeerId?: string
  videoStyle: CSSProperties
  showInfo?: boolean
  srtConnectUrl?: string
  srtListenPort?: number
  /** Общая громкость комнаты (0..1). */
  playoutVolume?: number
  /** Устройство вывода (setSinkId). */
  playoutSinkId?: string
  /** Доп. множитель только для screen-audio (0..1). */
  screenAudioGain?: number
  /** Для сохранения/чтения user-настройки screen-audio. */
  screenAudioGainOwnerPeerId?: string
  onStopShare?: () => void
  reactionBurst?: RoomReactionBurst | null
  showSoloViewerCopy?: boolean
  guestMute?: { show: boolean; onMute: () => void }
  extraMenuItems?: SrtCopyMenuExtraItem[]
  showTileOverflowButton?: boolean
}

export function LocalScreenShareTile({
  stream,
  audioStream = null,
  label,
  roomId,
  linkPeerId,
  videoStyle,
  showInfo,
  srtConnectUrl,
  srtListenPort,
  playoutVolume = 1,
  playoutSinkId = '',
  screenAudioGain = 0.15,
  screenAudioGainOwnerPeerId,
  onStopShare,
  reactionBurst,
  showSoloViewerCopy = true,
  guestMute,
  extraMenuItems,
  showTileOverflowButton = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [gainOpen, setGainOpen] = useState(false)
  const [gain, setGain] = useState(screenAudioGain)

  const gainKey = useMemo(() => {
    const rid = roomId?.trim() ?? ''
    const owner = screenAudioGainOwnerPeerId?.trim() ?? ''
    if (!rid || !owner) return ''
    return `vmix:mix:screen:${rid}:${owner}`
  }, [roomId, screenAudioGainOwnerPeerId])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream
    return () => {
      el.srcObject = null
    }
  }, [stream])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.srcObject = audioStream ?? null
    return () => {
      el.srcObject = null
    }
  }, [audioStream])

  useBindPlayout(audioRef, playoutVolume * gain, playoutSinkId, !!audioStream)

  useEffect(() => {
    if (!gainKey || typeof window === 'undefined') return
    const raw = window.localStorage.getItem(gainKey)
    const n = raw != null ? Number(raw) : NaN
    if (Number.isFinite(n)) setGain(Math.max(0, Math.min(2, n)))
  }, [gainKey])

  useEffect(() => {
    if (!gainKey || typeof window === 'undefined') return
    window.localStorage.setItem(gainKey, String(Math.max(0, Math.min(2, gain))))
  }, [gain, gainKey])

  return (
    <div className="participant-card participant-card--screen-share">
      <div className="card-video-wrap">
        <SrtCopySurface
          connectUrl={srtConnectUrl}
          listenPort={srtListenPort}
          roomId={roomId}
          tilePeerId={linkPeerId}
          showSoloViewerCopy={showSoloViewerCopy}
          guestMute={guestMute}
          extraMenuItems={extraMenuItems}
          showTileOverflowButton={showTileOverflowButton}
        >
          <video
            key={stream.id}
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="participant-card__main-video"
            style={videoStyle}
          />
          {audioStream ? <audio ref={audioRef} autoPlay playsInline /> : null}
          {showInfo && (
            <VideoInfoOverlay
              stream={stream}
              videoRef={videoRef}
              roomId={roomId}
              peerId={linkPeerId}
              srtConnectUrl={srtConnectUrl}
              showSoloViewerCopy={showSoloViewerCopy}
            />
          )}
          {reactionBurst ? <ReactionBurstOverlay key={reactionBurst.id} burst={reactionBurst} /> : null}
        </SrtCopySurface>
      </div>
      <div className="card-bar">
        <span className="card-name">{label}</span>
        <span className="card-bar-actions">
          {audioStream ? (
            <>
              <button
                type="button"
                className="card-bar-fav"
                onClick={(e) => {
                  e.stopPropagation()
                  setGainOpen((v) => !v)
                }}
                title="Громкость звука экрана"
                aria-label="Громкость звука экрана"
              >
                🔈
              </button>
              {gainOpen ? (
                <div
                  style={{
                    position: 'absolute',
                    right: 10,
                    bottom: 44,
                    padding: 10,
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(10,8,7,0.75)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 6,
                    width: 200,
                  }}
                  role="group"
                  aria-label="Громкость звука экрана"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, opacity: 0.85 }}>Звук экрана</span>
                    <span style={{ fontSize: 12, opacity: 0.7 }}>{Math.round(gain * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={Math.round(gain * 100)}
                    onChange={(e) => setGain(Number(e.target.value) / 100)}
                    style={{ width: '100%' }}
                  />
                </div>
              ) : null}
            </>
          ) : null}
          {onStopShare ? (
            <button
              type="button"
              className="card-stop-share-btn"
              onClick={(e) => {
                e.stopPropagation()
                onStopShare()
              }}
              title="Завершить демонстрацию для всех"
            >
              Завершить
            </button>
          ) : null}
        </span>
      </div>
    </div>
  )
}
