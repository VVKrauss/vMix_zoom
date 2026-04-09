import type { CSSProperties } from 'react'
import { memo, useEffect, useRef } from 'react'
import { AudioMeter } from '../AudioMeter'
import type { StudioSourceOption } from '../../types/studio'

interface Props {
  source: StudioSourceOption
  meterStream: MediaStream | null
  volume: number
  setVolume: (sourceKey: string, v: number) => void
  onAddToPreview: (sourceKey: string) => void
  onSendToProgram: (sourceKey: string) => void
}

function getSourceKindLabel(source: StudioSourceOption): string {
  const label = source.label.toLowerCase()
  if (source.key.includes('screen') || label.includes('screen') || label.includes('экран')) {
    return 'Screen'
  }
  return 'Camera'
}

const StudioSourceStripItem = memo(function StudioSourceStripItem({
  source,
  meterStream,
  volume,
  setVolume,
  onAddToPreview,
  onSendToProgram,
}: Props) {
  const thumbRef = useRef<HTMLVideoElement>(null)
  const primaryLabel = source.label.split(' - ')[0].split(' — ')[0]
  const volumePct = Math.round(volume * 100)
  const isMuted = volumePct === 0

  useEffect(() => {
    const el = thumbRef.current
    if (!el) return
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
          <video
            ref={thumbRef}
            className="studio-source-strip__thumb"
            autoPlay
            playsInline
            muted
          />
          <div className="studio-source-strip__thumb-overlay">
            <span className="studio-source-strip__thumb-chip">{getSourceKindLabel(source)}</span>
            {meterStream ? (
              <div className="studio-source-strip__meter-overlay" aria-label={`Уровень звука: ${source.label}`}>
                <AudioMeter
                  stream={meterStream}
                  stereo
                  outputGain={volume}
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
        <span className="studio-source-strip__cap">{primaryLabel}</span>
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
            onClick={() => setVolume(source.key, isMuted ? 1 : 0)}
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
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  )
}
