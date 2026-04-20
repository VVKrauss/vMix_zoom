import type { DmOutgoingReceiptLevel } from '../../lib/messenger'
import { DmSolidReceiptCircle } from './DmSolidReceiptCircle'

export function DmOutgoingReceiptGlyph({
  level,
  messageId,
  className = 'dashboard-messenger__dm-receipt-svg',
}: {
  level: DmOutgoingReceiptLevel
  messageId: string
  className?: string
}) {
  const clipId = `dmrch-${messageId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'm'}`
  const vb = 12
  const c = 6
  const r = 4.5
  const sw = 1.2

  if (level === 'pending') {
    return (
      <svg className={className} width={12} height={12} viewBox={`0 0 ${vb} ${vb}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={sw} strokeDasharray="2 2" />
      </svg>
    )
  }

  if (level === 'sent') {
    return (
      <svg className={className} width={12} height={12} viewBox={`0 0 ${vb} ${vb}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={sw} />
      </svg>
    )
  }

  if (level === 'delivered') {
    return (
      <svg className={className} width={12} height={12} viewBox={`0 0 ${vb} ${vb}`} aria-hidden>
        <defs>
          <clipPath id={clipId}>
            <rect x={c} y={0} width={c} height={vb} />
          </clipPath>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={sw} />
        <circle cx={c} cy={c} r={r} fill="currentColor" fillOpacity={0.45} clipPath={`url(#${clipId})`} />
      </svg>
    )
  }

  return <DmSolidReceiptCircle className={className} />
}

