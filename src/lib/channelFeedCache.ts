import type { DirectMessage } from './messenger'
import { idbGet, idbSet } from './idbKv'

export type CachedChannelFeed = {
  v: 1
  conversationId: string
  cachedAt: number
  hasMoreOlder: boolean
  posts: DirectMessage[]
}

const KEY_PREFIX = 'channel:'
const MAX_POSTS = 30

export async function loadCachedChannelFeed(conversationId: string): Promise<CachedChannelFeed | null> {
  const cid = conversationId.trim()
  if (!cid) return null
  const key = `${KEY_PREFIX}${cid}`
  const raw = await idbGet<unknown>('channelFeedV1', key)
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Partial<CachedChannelFeed>
  if (o.v !== 1) return null
  if (typeof o.conversationId !== 'string' || o.conversationId.trim() !== cid) return null
  if (typeof o.cachedAt !== 'number' || !Number.isFinite(o.cachedAt)) return null
  if (!Array.isArray(o.posts)) return null
  return {
    v: 1,
    conversationId: cid,
    cachedAt: o.cachedAt,
    hasMoreOlder: Boolean(o.hasMoreOlder),
    posts: (o.posts as DirectMessage[]).slice(0, MAX_POSTS),
  }
}

export async function saveCachedChannelFeed(conversationId: string, posts: DirectMessage[], hasMoreOlder: boolean): Promise<void> {
  const cid = conversationId.trim()
  if (!cid) return
  const key = `${KEY_PREFIX}${cid}`
  const payload: CachedChannelFeed = {
    v: 1,
    conversationId: cid,
    cachedAt: Date.now(),
    hasMoreOlder: Boolean(hasMoreOlder),
    posts: [...posts].slice(-MAX_POSTS),
  }
  await idbSet('channelFeedV1', key, payload)
}
