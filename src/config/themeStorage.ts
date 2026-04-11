export const LS_APP_THEME = 'vmix_ui_theme'

export type AppTheme = 'dark' | 'light'

export function getStoredTheme(): AppTheme {
  if (typeof window === 'undefined') return 'dark'
  try {
    const v = localStorage.getItem(LS_APP_THEME)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* noop */
  }
  return 'dark'
}

export function setStoredTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(LS_APP_THEME, theme)
  } catch {
    /* noop */
  }
}

/** Синхронизирует `data-theme` на `<html>` с выбранной темой. */
export function applyTheme(theme: AppTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'light') {
    root.dataset.theme = 'light'
  } else {
    delete root.dataset.theme
  }
}
