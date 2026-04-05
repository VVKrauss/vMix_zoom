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

export const CHAT_MESSAGE_MAX_LEN = 2000
export const CHAT_MESSAGES_CAP = 200
export const REACTION_TTL_DEFAULT_MS = 3500
/** Как на сервере (services/server/src/chat.js) */
export const REACTION_EMOJI_WHITELIST = ['👍', '👏', '❤️', '😂', '🔥'] as const
export type ReactionEmoji = (typeof REACTION_EMOJI_WHITELIST)[number]

export function pickLatestBurstForPeer(
  bursts: RoomReactionBurst[],
  peerId: string,
): RoomReactionBurst | null {
  let last: RoomReactionBurst | null = null
  for (const b of bursts) {
    if (b.peerId === peerId) last = b
  }
  return last
}
