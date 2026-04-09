import type { CSSProperties } from 'react'
import { memo, useEffect, useRef } from 'react'
import { AudioMeter } from '../AudioMeter'
import type { StudioSourceOption } from '../../types/studio'

interface Props {
  source: StudioSourceOption
  meterStream: MediaStream | null
  volume: number
  /** Стабильная ссылка из родителя — для React.memo полосы источников. */
  setVolume: (sourceKey: string, v: number) => void
}

export const StudioSourceStripItem = memo(function StudioSourceStripItem({
  source,
  meterStream,
  volume,
  setVolume,
}: Props) {
  const volPct = `${Math.round(volume * 100)}%`
  const thumbRef = useRef<HTMLVideoElement>(null)

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
      <div className="studio-source-strip__row">
        <div className="studio-source-strip__vm-bundle">
          <video
            ref={thumbRef}
            className="studio-source-strip__thumb"
            autoPlay
            playsInline
            muted
          />
          <div
            className="studio-source-strip__meter-col"
            role={meterStream ? 'img' : undefined}
            aria-label={meterStream ? `Уровень звука: ${source.label}` : undefined}
          >
            {meterStream ? (
              <div className="studio-source-strip__meter-inner">
                <AudioMeter
                  stream={meterStream}
                  stereo
                  outputGain={volume}
                  fillParent
                  className="studio-source-strip__audio-meter"
                />
              </div>
            ) : (
              <span className="studio-source-strip__meter-col--empty">—</span>
            )}
          </div>
        </div>

        <div className="studio-source-strip__controls-col">
          <div className="studio-source-strip__fader" title="Громкость в микшере">
            <div className="studio-source-strip__fader-inner">
              <input
                type="range"
                className="studio-source-strip__vol"
                min={0}
                max={100}
                step={1}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(source.key, Number(e.target.value) / 100)}
                aria-label={`Громкость: ${source.label}`}
                style={{ '--studio-vol-pct': volPct } as CSSProperties}
              />
            </div>
          </div>
        </div>
      </div>
      <span className="studio-source-strip__cap">{source.label.split(' — ')[0]}</span>
    </div>
  )
})
