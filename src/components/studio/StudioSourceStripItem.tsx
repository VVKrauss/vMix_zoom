import type { CSSProperties } from 'react'
import { memo, useEffect, useRef } from 'react'
import { AudioMeter } from '../AudioMeter'
import type { StudioSourceOption } from '../../types/studio'

interface Props {
  source: StudioSourceOption
  meterStream: MediaStream | null
  volume: number
  setVolume: (sourceKey: string, v: number) => void
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
      <div className="studio-source-strip__meta-row">
        <span className="studio-source-strip__cap">{primaryLabel}</span>
        <div className="studio-source-strip__controls-col">
          <div className="studio-source-strip__fader" title="Громкость в микшере">
            <div className="studio-source-strip__fader-inner">
              <input
                type="range"
                className="studio-source-strip__vol studio-source-strip__vol--horizontal"
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
          <button
            type="button"
            className={`studio-source-strip__mute${isMuted ? ' studio-source-strip__mute--active' : ''}`}
            onClick={() => setVolume(source.key, isMuted ? 1 : 0)}
          >
            MUTE
          </button>
        </div>
      </div>
    </div>
  )
})

export default StudioSourceStripItem
