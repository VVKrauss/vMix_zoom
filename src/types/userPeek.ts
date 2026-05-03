export type UserPeekTarget = {
  userId: string
  displayName?: string | null
  avatarUrl?: string | null
  /** Если открыли из открытого ЛС — число сообщений в этом диалоге (иначе подгружаем). */
  directThreadMessageCount?: number | null
}
