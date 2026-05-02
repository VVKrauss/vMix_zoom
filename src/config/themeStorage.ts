export const LS_APP_THEME = 'vmix_ui_theme'

export type AppTheme = 'dark' | 'light' | 'auto'

type ResolvedUiTheme = 'light' | 'dark'

let mediaListener: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null = null
let boundMql: MediaQueryList | null = null

function clearSystemThemeListener(): void {
  if (boundMql && mediaListener) {
    boundMql.removeEventListener('change', mediaListener)
  }
  boundMql = null
  mediaListener = null
}

function prefersDarkScheme(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Эффективная тема для DOM (`data-theme`): светлая или тёмная; «авто» → системная. */
export function resolveAppTheme(theme: AppTheme): ResolvedUiTheme {
  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'
  return prefersDarkScheme() ? 'dark' : 'light'
}

function applyResolved(mode: ResolvedUiTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'light') {
    root.dataset.theme = 'light'
  } else {
    delete root.dataset.theme
  }
}

export function getStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'auto'
  try {
    const v = localStorage.getItem(LS_APP_THEME)
    if (v === 'glass') return 'dark'
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    /* noop */
  }
  return 'auto'
}

export function setStoredTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(LS_APP_THEME, theme)
  } catch {
    /* noop */
  }
}

/** Синхронизирует `data-theme` на `<html>` (`light` или без атрибута для тёмной); в режиме `auto` подписывается на смену системной темы. */
export function applyTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  clearSystemThemeListener()
  applyResolved(resolveAppTheme(theme))
  if (theme !== 'auto' || typeof window === 'undefined') return
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    applyResolved(resolveAppTheme('auto'))
  }
  mediaListener = onChange
  boundMql = mql
  mql.addEventListener('change', onChange)
}
