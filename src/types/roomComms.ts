/** Сообщение чата после нормализации сервером */
export type RoomChatMessage = {
  roomId?: string
  peerId: string
  name: string
  text: string
  ts: number
  /** Локальная строка из события reaction (не приходит с сервера как отдельный тип сообщения) */
  kind?: 'reaction'
}

/** Входящая реакция (broadcast) */
export type RoomReactionEvent = {
  roomId?: string
  peerId: string
  emoji: string
  ts: number
  ttlMs?: number
}

/** Для оверлея на плитке */
export type RoomReactionBurst = {
  id: string
  peerId: string
  emoji: string
}

/** Строки чата, похожие на системное уведомление о демонстрации (бэкенд) — убираем при остановке экрана. */
export function isScreenShareChatNotice(text: string): boolean {
  return /демонстрац|экран(а|ом|\))|\bscreen\s*share|sharing.{0,16}screen|презентац|presentation/i.test(
    text,
  )
}

export const CHAT_MESSAGE_MAX_LEN = 2000
export const CHAT_MESSAGES_CAP = 200
export const REACTION_TTL_DEFAULT_MS = 3500
/** Как на сервере (services/server/src/chat.js) */
export const REACTION_EMOJI_WHITELIST = ['👍', '👏', '❤️', '😂', '🔥', '✋', '🖖'] as const
export type ReactionEmoji = (typeof REACTION_EMOJI_WHITELIST)[number]

export function pickLatestBurstForPeer(
  bursts: RoomReactionBurst[],
  peerId: string,
): RoomReactionBurst | null {
  for (let i = bursts.length - 1; i >= 0; i--) {
    if (bursts[i].peerId === peerId) return bursts[i]
  }
  return null
}
