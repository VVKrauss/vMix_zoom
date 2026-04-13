interface Props {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  /** Подпись слева (состояние «выкл»). Если не задана вместе с onLabel — только переключатель. */
  offLabel?: string
  /** Подпись справа (состояние «вкл»). */
  onLabel?: string
  ariaLabel: string
  /** Уменьшенный вид для попапов настроек / камеры. */
  compact?: boolean
  className?: string
  disabled?: boolean
}

export function PillToggle({
  checked,
  onCheckedChange,
  offLabel,
  onLabel,
  ariaLabel,
  compact = false,
  className = '',
  disabled = false,
}: Props) {
  const hasLabels = offLabel != null && onLabel != null
  const root =
    `pill-toggle${compact ? ' pill-toggle--compact' : ''}${!hasLabels ? ' pill-toggle--switch-only' : ''}${className ? ` ${className}` : ''}`
  return (
    <div className={root}>
      {hasLabels ? (
        <span className={`pill-toggle__text${!checked ? ' pill-toggle__text--active' : ''}`}>{offLabel}</span>
      ) : null}
      <button
        type="button"
        className={`pill-toggle__switch${checked ? ' pill-toggle__switch--on' : ''}`}
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className="pill-toggle__thumb" />
      </button>
      {hasLabels ? (
        <span className={`pill-toggle__text${checked ? ' pill-toggle__text--active' : ''}`}>{onLabel}</span>
      ) : null}
    </div>
  )
}
