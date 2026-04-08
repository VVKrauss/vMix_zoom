import { MicIcon, MicOffIcon } from '../icons'
import { AudioMeter } from '../AudioMeter'
import type { StudioSourceOption } from '../../types/studio'

interface Props {
  source: StudioSourceOption
  meterStream: MediaStream | null
  volume: number
  muted: boolean
  onVolumeChange: (v: number) => void
  onMutedChange: (m: boolean) => void
}

export function StudioSourceStripItem({
  source,
  meterStream,
  volume,
  muted,
  onVolumeChange,
  onMutedChange,
}: Props) {
  const pct = Math.round(volume * 100)

  return (
    <div className="studio-source-strip__item" title={source.label}>
      <div className="studio-source-strip__thumb-wrap">
        <video
          className="studio-source-strip__thumb"
          autoPlay
          playsInline
          muted
          ref={(el) => {
            if (el) {
              el.srcObject = source.stream
              void el.play().catch(() => {})
            }
          }}
        />
        <span className="studio-source-strip__cap">{source.label.split(' — ')[0]}</span>
      </div>
      <div className="studio-source-strip__controls">
        <div className="studio-source-strip__slider-wrap" title="Громкость в микшере">
          <input
            type="range"
            className="studio-source-strip__vol"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            aria-label={`Громкость: ${source.label}`}
          />
        </div>
        <div className="studio-source-strip__level-col">
          <span className="studio-source-strip__level-value" aria-live="polite">
            {muted ? '—' : `${pct}%`}
          </span>
          <div className="studio-source-strip__level-meter">
            {meterStream ? (
              <AudioMeter
                stream={meterStream}
                orientation="horizontal"
                outputGain={volume}
                outputMuted={muted}
              />
            ) : (
              <span className="studio-source-strip__meter--empty">Нет звука</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={`studio-source-strip__mute${muted ? ' studio-source-strip__mute--on' : ''}`}
          onClick={() => onMutedChange(!muted)}
          title={muted ? 'Включить в микшере' : 'Заглушить в микшере'}
          aria-pressed={muted}
        >
          <span className="studio-source-strip__mute-icon" aria-hidden>
            {muted ? <MicOffIcon /> : <MicIcon />}
          </span>
        </button>
      </div>
    </div>
  )
}
