import { useCallback, useState } from 'react'
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  type AppTheme,
} from '../config/themeStorage'
import { FiRrIcon, SettingsGearIcon } from './icons'

type Variant = 'inline'

function MoonIcon() {
  return <FiRrIcon name="moon" className="theme-toggle__fi" />
}

/** Режим «как в системе» — день/ночь (Flaticon UI Icons, аналог night mode). */
function AutoThemeIcon() {
  return <FiRrIcon name="night-day" className="theme-toggle__fi" />
}

type Props = {
  variant?: Variant
  className?: string
}

const cycle: Record<AppTheme, AppTheme> = {
  auto: 'light',
  light: 'dark',
  dark: 'auto',
}

const labelByTheme: Record<AppTheme, string> = {
  auto: 'Автотема (как в системе). Нажмите — светлая тема',
  light: 'Светлая тема. Нажмите — тёмная',
  dark: 'Тёмная тема. Нажмите — автотема',
}

export function ThemeToggle({ variant = 'inline', className = '' }: Props) {
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme())

  const advance = useCallback(() => {
    const next = cycle[theme]
    setStoredTheme(next)
    applyTheme(next)
    setTheme(next)
  }, [theme])

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${variant} ${className}`.trim()}
      onClick={advance}
      title={labelByTheme[theme]}
      aria-label={labelByTheme[theme]}
      aria-pressed={theme === 'light'}
    >
      {theme === 'auto' ? (
        <AutoThemeIcon />
      ) : theme === 'light' ? (
        <SettingsGearIcon className="theme-toggle__fi" />
      ) : (
        <MoonIcon />
      )}
    </button>
  )
}
