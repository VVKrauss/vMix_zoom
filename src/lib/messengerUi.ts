export type MessengerFontPreset = 's' | 'm' | 'l'

const LS_FONT = 'messenger_ui_font'

export function getMessengerFontPreset(): MessengerFontPreset {
  if (typeof window === 'undefined') return 'm'
  try {
    const v = localStorage.getItem(LS_FONT)
    if (v === 's' || v === 'm' || v === 'l') return v
  } catch {
    /* noop */
  }
  return 'm'
}

export function setMessengerFontPreset(p: MessengerFontPreset): void {
  try {
    localStorage.setItem(LS_FONT, p)
  } catch {
    /* noop */
  }
}

/** Короткая подпись цитаты в ответе (без дублирования всего текста). */
export function truncateMessengerReplySnippet(text: string, maxChars = 20): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars)}…`
}
