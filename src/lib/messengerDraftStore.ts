/** In-memory черновики текста композера по id чата (переживает смену треда без remount). */
const drafts = new Map<string, string>()

export function getMessengerDraftText(conversationId: string): string {
  const id = conversationId.trim()
  if (!id) return ''
  return drafts.get(id) ?? ''
}

export function setMessengerDraftText(conversationId: string, text: string): void {
  const id = conversationId.trim()
  if (!id) return
  drafts.set(id, text)
}

export function clearMessengerDraftText(conversationId: string): void {
  drafts.delete(conversationId.trim())
}
