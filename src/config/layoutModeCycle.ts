import type { StoredLayoutMode } from './roomUiStorage'

export const LAYOUT_CYCLE: StoredLayoutMode[] = ['grid', 'speaker', 'pip']

export function nextLayoutMode(current: StoredLayoutMode): StoredLayoutMode {
  const i = LAYOUT_CYCLE.indexOf(current)
  return LAYOUT_CYCLE[(i + 1) % LAYOUT_CYCLE.length]!
}

export function layoutModeShortLabel(mode: StoredLayoutMode): string {
  switch (mode) {
    case 'grid':
      return 'Сетка'
    case 'speaker':
      return 'Спикер'
    case 'pip':
      return 'PiP'
    default:
      return mode
  }
}