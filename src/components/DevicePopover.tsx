import { useEffect, useRef } from 'react'
import { PillToggle } from './PillToggle'
import { shouldClosePopoverOnOutsidePointer } from '../utils/popoverOutsideClick'
import type { SimpleVideoQualityTier } from '../utils/simpleVideoQuality'
import {
  SIMPLE_VIDEO_QUALITY_LABELS,
  SIMPLE_VIDEO_QUALITY_ORDER,
} from '../utils/simpleVideoQuality'

interface Props {
  label: string
  devices: MediaDeviceInfo[]
  selectedId: string
  onSelect: (deviceId: string) => void
  onClose: () => void
  /** Локальное превью как в зеркале (только для камеры). */
  mirrorLocalPreview?: boolean
  onToggleMirrorLocalPreview?: () => void
  /** Простое качество исходящего видео (меню камеры). */
  videoQualityTier?: SimpleVideoQualityTier
  onVideoQualityTierChange?: (tier: SimpleVideoQualityTier) => void
  /** Аудиометр на плитках (меню микрофона). */
  audioMeter?: boolean
  onToggleAudioMeter?: () => void
}

export function DevicePopover({
  label,
  devices,
  selectedId,
  onSelect,
  onClose,
  mirrorLocalPreview,
  onToggleMirrorLocalPreview,
  videoQualityTier,
  onVideoQualityTierChange,
  audioMeter,
  onToggleAudioMeter,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (shouldClosePopoverOnOutsidePointer(ref.current, e.target)) onClose()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div className="device-popover" ref={ref}>
      <div className="device-popover__title">{label}</div>
      {devices.length === 0 && (
        <div className="device-popover__empty">Нет доступных устройств</div>
      )}
      {devices.map(d => (
        <button
          key={d.deviceId}
          className={`device-popover__item ${d.deviceId === selectedId ? 'device-popover__item--active' : ''}`}
          onClick={() => { onSelect(d.deviceId); onClose() }}
        >
          {d.deviceId === selectedId && <CheckIcon />}
          <span>{d.label || `Устройство ${d.deviceId.slice(0, 8)}`}</span>
        </button>
      ))}
      {videoQualityTier != null && onVideoQualityTierChange ? (
        <div className="device-popover__section device-popover__section--quality">
          <span className="device-popover__label">Качество видео</span>
          <div className="device-popover__quality-tiers" role="group" aria-label="Качество исходящего видео">
            {SIMPLE_VIDEO_QUALITY_ORDER.map((tier) => (
              <button
                key={tier}
                type="button"
                className={`device-popover__quality-tier${videoQualityTier === tier ? ' device-popover__quality-tier--active' : ''}`}
                onClick={() => onVideoQualityTierChange(tier)}
              >
                {SIMPLE_VIDEO_QUALITY_LABELS[tier]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {audioMeter != null && onToggleAudioMeter ? (
        <div className="device-popover__footer">
          <div className="device-popover__mirror-row">
            <span className="device-popover__mirror-label">Аудиометр</span>
            <PillToggle
              compact
              checked={audioMeter}
              onCheckedChange={() => onToggleAudioMeter()}
              ariaLabel="Аудиометр на плитках"
            />
          </div>
        </div>
      ) : null}
      {mirrorLocalPreview != null && onToggleMirrorLocalPreview ? (
        <div className="device-popover__footer">
          <div className="device-popover__mirror-row">
            <span className="device-popover__mirror-label">Зеркалить превью</span>
            <PillToggle
              compact
              checked={mirrorLocalPreview}
              onCheckedChange={() => onToggleMirrorLocalPreview()}
              ariaLabel="Зеркалить локальное превью камеры"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
