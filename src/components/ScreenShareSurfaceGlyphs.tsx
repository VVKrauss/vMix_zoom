/** Общие inline-SVG для выбора поверхности демонстрации (модалка + popover). */

export function ScreenShareGlyphMonitor({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="6" y="8" width="36" height="26" rx="3" />
      <path d="M16 38h16M24 34v4" strokeLinecap="round" />
    </svg>
  )
}

export function ScreenShareGlyphWindow({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="8" y="12" width="32" height="28" rx="2" />
      <path d="M8 18h32" />
      <circle cx="14" cy="15" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ScreenShareGlyphTab({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 14h36v22a3 3 0 01-3 3H9a3 3 0 01-3-3V14z" />
      <path d="M6 14V11a3 3 0 013-3h30a3 3 0 013 3v3" />
      <path d="M18 22h16M18 28h10" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
