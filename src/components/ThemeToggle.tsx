import { useCallback, useState } from 'react'
import { applyTheme, getStoredTheme, setStoredTheme, type AppTheme } from '../config/themeStorage'

type Variant = 'inline' | 'fab'

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinejoin="round" />
    </svg>
  )
}

type Props = {
  variant?: Variant
  className?: string
}

export function ThemeToggle({ variant = 'inline', className = '' }: Props) {
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme())

  const toggle = useCallback(() => {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark'
    setStoredTheme(next)
    applyTheme(next)
    setTheme(next)
  }, [theme])

  const isLight = theme === 'light'
  const label = isLight ? 'Тёмная тема' : 'Светлая тема'

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${variant} ${className}`.trim()}
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={isLight}
    >
      {isLight ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}
