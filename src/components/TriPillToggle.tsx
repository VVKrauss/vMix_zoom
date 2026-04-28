import type { MouseEvent } from 'react'

export type TriPillValue = 'off' | 'auto' | 'on'

type Props = {
  value: TriPillValue
  onChange: (next: TriPillValue) => void
  ariaLabel: string
  /** Пишем только "Авто" (центр). */
  autoLabel?: string
  disabled?: boolean
  className?: string
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function pickValueFromClick(e: MouseEvent<HTMLButtonElement>): TriPillValue {
  const r = e.currentTarget.getBoundingClientRect()
  const x = clamp01((e.clientX - r.left) / Math.max(1, r.width))
  if (x < 1 / 3) return 'off'
  if (x < 2 / 3) return 'auto'
  return 'on'
}

function thumbClass(value: TriPillValue): string {
  if (value === 'on') return 'pill-toggle__thumb pill-toggle__thumb--tri pill-toggle__thumb--tri-on'
  if (value === 'auto') return 'pill-toggle__thumb pill-toggle__thumb--tri pill-toggle__thumb--tri-auto'
  return 'pill-toggle__thumb pill-toggle__thumb--tri pill-toggle__thumb--tri-off'
}

function switchClass(value: TriPillValue): string {
  const base = 'pill-toggle__switch pill-toggle__switch--tri'
  if (value === 'on') return `${base} pill-toggle__switch--tri-on`
  if (value === 'auto') return `${base} pill-toggle__switch--tri-auto`
  return `${base} pill-toggle__switch--tri-off`
}

export function TriPillToggle({
  value,
  onChange,
  ariaLabel,
  autoLabel = 'Авто',
  disabled = false,
  className = '',
}: Props) {
  return (
    <div className={`pill-toggle pill-toggle--tri ${className}`.trim()}>
      <button
        type="button"
        className={switchClass(value)}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={(e) => onChange(pickValueFromClick(e))}
      >
        <span className="pill-toggle__tri-auto-label" aria-hidden="true">
          {autoLabel}
        </span>
        <span className={thumbClass(value)} />
      </button>
    </div>
  )
}

