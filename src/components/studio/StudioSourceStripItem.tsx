import type { CSSProperties } from 'react'
import { memo, useEffect, useRef } from 'react'
import { AudioMeter } from '../AudioMeter'
import { ParticipantTileIdle } from '../ParticipantTileIdle'
import type { StudioSourceOption } from '../../types/studio'
import { StarIcon } from '../icons'

interface Props {
  source: StudioSourceOption
  meterStream: MediaStream | null
  volume: number
  muted: boolean
  setVolume: (sourceKey: string, v: number) => void
  onToggleMute: (sourceKey: string) => void
  onAddToPreview: (sourceKey: string) => void
  onSendToProgram: (sourceKey: string) => void
  favoriteShow?: boolean
  favoriteActive?: boolean
  onToggleFavorite?: () => void
}

function getSourceKindLabel(source: StudioSourceOption): string {
  if (source.kind === 'screen') {
    return 'Screen'
  }
  return 'Camera'
}

const StudioSourceStripItem = memo(function StudioSourceStripItem({
  source,
  meterStream,
  volume,
  muted,
  setVolume,
  onToggleMute,
  onAddToPreview,
  onSendToProgram,
  favoriteShow = false,
  favoriteActive = false,
  onToggleFavorite,
}: Props) {
  const thumbRef = useRef<HTMLVideoElement>(null)
  const primaryLabel = source.label.split(' - ')[0].split(' — ')[0]
  const volumePct = Math.round(volume * 100)
  const isMuted = muted
  const hasLiveVideo = Boolean(source.stream)

  useEffect(() => {
    const el = thumbRef.current
    if (!el || !source.stream) return
    el.srcObject = source.stream
    void el.play().catch(() => {})
    return () => {
      el.srcObject = null
    }
  }, [source.stream])

  return (
    <div className="studio-source-strip__item" title={source.label}>
      <div className="studio-source-strip__top-row">
        <div className="studio-source-strip__thumb-frame">
          {hasLiveVideo ? (
            <video
              ref={thumbRef}
              className="studio-source-strip__thumb"
              autoPlay
              playsInline
              muted
            />
          ) : (
            <div className="studio-source-strip__thumb-placeholder">
              <ParticipantTileIdle name={source.displayName} avatarUrl={source.avatarUrl} />
            </div>
          )}
          <div className="studio-source-strip__thumb-overlay">
            <span className="studio-source-strip__thumb-chip">{getSourceKindLabel(source)}</span>
            {meterStream ? (
              <div className="studio-source-strip__meter-overlay" aria-label={`Уровень звука: ${source.label}`}>
                <AudioMeter
                  stream={meterStream}
                  stereo
                  outputGain={volume}
                  outputMuted={isMuted}
                  fillParent
                  className="studio-source-strip__audio-meter"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="studio-source-strip__fader-stack">
          <div className="studio-source-strip__fader-rail" title="Громкость в микшере">
            <div className="studio-source-strip__fader-track">
              <input
                type="range"
                className="studio-source-strip__vol studio-source-strip__vol--vertical"
                min={0}
                max={100}
                step={1}
                value={volumePct}
                onChange={(e) => setVolume(source.key, Number(e.target.value) / 100)}
                aria-label={`Громкость: ${source.label}`}
                style={{ '--studio-vol-pct': `${volumePct}%` } as CSSProperties}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="studio-source-strip__bottom-row">
        <div className="studio-source-strip__name-fav">
          <span className="studio-source-strip__cap studio-source-strip__cap--grow">{primaryLabel}</span>
          {favoriteShow && onToggleFavorite ? (
            <button
              type="button"
              className={`studio-source-strip__fav-ico${favoriteActive ? ' studio-source-strip__fav-ico--on' : ''}`}
              onClick={onToggleFavorite}
              title={favoriteActive ? 'Убрать из избранного' : 'В избранное'}
              aria-label={favoriteActive ? 'Убрать из избранного' : 'В избранное'}
            >
              <StarIcon filled={favoriteActive} />
            </button>
          ) : null}
        </div>
        <div className="studio-source-strip__meta-actions">
          <button
            type="button"
            className="studio-source-strip__action studio-source-strip__action--preview"
            onClick={() => onAddToPreview(source.key)}
            title="Добавить в превью"
            aria-label={`Добавить ${source.label} в превью`}
          >
            ↑
          </button>
          <button
            type="button"
            className="studio-source-strip__action studio-source-strip__action--program"
            onClick={() => onSendToProgram(source.key)}
            title="Отправить в эфир"
            aria-label={`Отправить ${source.label} в эфир`}
          >
            LIVE
          </button>
          <button
            type="button"
            className={`studio-source-strip__action studio-source-strip__action--mute${isMuted ? ' studio-source-strip__action--mute-active' : ''}`}
            onClick={() => onToggleMute(source.key)}
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
            aria-label={isMuted ? `Включить звук ${source.label}` : `Выключить звук ${source.label}`}
          >
            <MuteIcon muted={isMuted} />
          </button>
        </div>
      </div>
    </div>
  )
})

export default StudioSourceStripItem

function MuteIcon({ muted }: { muted: boolean }) {
  if (muted) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="2" y1="2" x2="22" y2="22" />
        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.13" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}
