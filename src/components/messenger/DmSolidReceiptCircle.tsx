/** Тот же круг, что у исходящего «прочитано» в ЛС (DmOutgoingReceiptGlyph read). */
export function DmSolidReceiptCircle({ className }: { className?: string }) {
  return (
    <svg className={className} width={12} height={12} viewBox="0 0 12 12" aria-hidden>
      <circle cx={6} cy={6} r={4.5} fill="currentColor" />
    </svg>
  )
}
