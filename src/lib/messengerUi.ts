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

/** Аватар автора цитаты в ЛС (я / собеседник). */
export function resolveQuotedAvatarForDm(
  quotedUserId: string | null | undefined,
  currentUserId: string | undefined,
  profileAvatar: string | null | undefined,
  conv: { otherUserId: string | null; avatarUrl: string | null } | null,
): string | null {
  const qid = quotedUserId?.trim()
  if (!qid) return null
  if (currentUserId && qid === currentUserId) return profileAvatar?.trim() || null
  if (conv?.otherUserId?.trim() === qid) return conv.avatarUrl?.trim() || null
  if (currentUserId && qid !== currentUserId && conv?.avatarUrl?.trim()) return conv.avatarUrl.trim()
  return null
}

/** Короткая подпись цитаты в ответе (без дублирования всего текста). */
export function truncateMessengerReplySnippet(text: string, maxChars = 20): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars)}…`
}
