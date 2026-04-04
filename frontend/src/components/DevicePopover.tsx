import { useEffect, useRef } from 'react'

interface Props {
  label: string
  devices: MediaDeviceInfo[]
  selectedId: string
  onSelect: (deviceId: string) => void
  onClose: () => void
}

export function DevicePopover({ label, devices, selectedId, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
