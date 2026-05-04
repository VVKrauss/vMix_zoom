import { useEffect, useRef, useState } from 'react'
import type { DmOutgoingReceiptLevel } from '../../lib/messenger'
import { DmOutgoingReceiptGlyph } from './DmOutgoingReceiptGlyph'

function receiptTooltipLabel(level: DmOutgoingReceiptLevel): string {
  if (level === 'pending') return 'Отправка'
  if (level === 'read') return 'Прочитано'
  if (level === 'delivered') return 'Доставлено'
  return 'Отправлено'
}

/** Устройства без наведения: подсказка по тапу; иначе достаточно `title` при hover. */
function prefersTapHint(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(hover: none)').matches
}

/**
 * Индикатор доставки исходящего в ЛС: `title` при наведении, на touch — короткая всплывашка по тапу.
 */
export function DmOutgoingReceiptHintTrigger({
  level,
  messageId,
  className,
}: {
  level: DmOutgoingReceiptLevel
  messageId: string
  className: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLButtonElement>(null)
  const label = receiptTooltipLabel(level)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc, true)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('pointerdown', onDoc, true)
    }
  }, [open])

  return (
    <button
      ref={wrapRef}
      type="button"
      className={`dashboard-messenger__dm-receipt--hint-trigger ${className}`.trim()}
      title={label}
      aria-label={label}
      aria-expanded={prefersTapHint() ? open : undefined}
      onClick={(e) => {
        if (!prefersTapHint()) return
        e.stopPropagation()
        setOpen((v) => !v)
      }}
      onKeyDown={(e) => {
        if (!prefersTapHint()) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }
      }}
    >
      {open ? (
        <span className="dashboard-messenger__dm-receipt-hint-pop" role="tooltip">
          {label}
        </span>
      ) : null}
      <DmOutgoingReceiptGlyph level={level} messageId={messageId} />
    </button>
  )
}
