import type { DirectMessage } from './messenger'
import { idbGet, idbSet } from './idbKv'
import { sortDirectMessagesChrono } from './messengerDashboardUtils'

export const MESSENGER_THREAD_TAIL_MAX = 50

export type MessengerThreadTailScope = 'direct' | 'group'

export type MessengerThreadTailCacheRow = {
  v: 1
  scope: MessengerThreadTailScope
  conversationId: string
  updatedAt: number
  messages: DirectMessage[]
}

function cacheKey(scope: MessengerThreadTailScope, conversationId: string): string {
  return `${scope}:${conversationId.trim()}`
}

export async function readMessengerThreadTailCache(
  scope: MessengerThreadTailScope,
  conversationId: string,
): Promise<DirectMessage[] | null> {
  const cid = conversationId.trim()
  if (!cid) return null
  const row = await idbGet<MessengerThreadTailCacheRow>('messengerThreadTailV1', cacheKey(scope, cid))
  if (!row || row.v !== 1 || row.scope !== scope || row.conversationId.trim() !== cid) return null
  if (!Array.isArray(row.messages) || row.messages.length === 0) return null
  return row.messages
}

export async function writeMessengerThreadTailCache(
  scope: MessengerThreadTailScope,
  conversationId: string,
  messages: DirectMessage[],
): Promise<void> {
  const cid = conversationId.trim()
  if (!cid || messages.length === 0) return
  const tail = [...messages].sort(sortDirectMessagesChrono).slice(-MESSENGER_THREAD_TAIL_MAX)
  const payload: MessengerThreadTailCacheRow = {
    v: 1,
    scope,
    conversationId: cid,
    updatedAt: Date.now(),
    messages: tail,
  }
  await idbSet('messengerThreadTailV1', cacheKey(scope, cid), payload)
}
