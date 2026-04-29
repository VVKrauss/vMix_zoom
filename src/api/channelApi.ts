import { fetchJson } from './http'

export async function v1CreateChannel(args: {
  title: string
  isPublic?: boolean
  postingMode?: 'admins_only' | 'everyone'
  commentsMode?: 'everyone' | 'disabled'
}): Promise<{ data: string | null; error: string | null }> {
  const r = await fetchJson<{ channelId: string }>('/api/v1/channels', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({
      title: args.title,
      isPublic: args.isPublic ?? false,
      postingMode: args.postingMode ?? 'admins_only',
      commentsMode: args.commentsMode ?? 'everyone',
    }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const id = typeof (r.data as any)?.channelId === 'string' ? (r.data as any).channelId : null
  return { data: id, error: null }
}

export async function v1UpdateChannelProfile(conversationId: string, patch: any): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(patch ?? {}),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

export async function v1JoinPublicChannel(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/channels/${encodeURIComponent(cid)}/join`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_joined' }
  return { error: null }
}

export async function v1LeaveChannel(conversationId: string): Promise<{ error: string | null }> {
  const cid = conversationId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/channels/${encodeURIComponent(cid)}/leave`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok !== true) return { error: typeof data?.error === 'string' ? data.error : 'not_left' }
  return { error: null }
}

export async function v1ListChannelPostsPage(args: {
  conversationId: string
  limit: number
  before?: { createdAt: string; id: string } | null
}): Promise<{ data: unknown[] | null; error: string | null; hasMoreOlder: boolean }> {
  const cid = args.conversationId.trim()
  const qs = new URLSearchParams()
  qs.set('limit', String(args.limit))
  if (args.before?.createdAt) qs.set('beforeCreatedAt', args.before.createdAt)
  if (args.before?.id) qs.set('beforeId', args.before.id)
  const r = await fetchJson<{ posts: unknown[]; hasMoreOlder: boolean }>(
    `/api/v1/channels/${encodeURIComponent(cid)}/posts?${qs.toString()}`,
    { method: 'GET', auth: true },
  )
  if (!r.ok) return { data: null, error: r.error.message, hasMoreOlder: false }
  return {
    data: Array.isArray((r.data as any)?.posts) ? (r.data as any).posts : [],
    error: null,
    hasMoreOlder: (r.data as any)?.hasMoreOlder === true,
  }
}

export async function v1ListChannelCommentsPage(args: {
  conversationId: string
  postId: string
  limit: number
  before?: { createdAt: string; id: string } | null
}): Promise<{ data: unknown[] | null; error: string | null; hasMoreOlder: boolean }> {
  const cid = args.conversationId.trim()
  const pid = args.postId.trim()
  const qs = new URLSearchParams()
  qs.set('limit', String(args.limit))
  if (args.before?.createdAt) qs.set('beforeCreatedAt', args.before.createdAt)
  if (args.before?.id) qs.set('beforeId', args.before.id)
  const r = await fetchJson<{ comments: unknown[]; hasMoreOlder: boolean }>(
    `/api/v1/channels/${encodeURIComponent(cid)}/posts/${encodeURIComponent(pid)}/comments?${qs.toString()}`,
    { method: 'GET', auth: true },
  )
  if (!r.ok) return { data: null, error: r.error.message, hasMoreOlder: false }
  return {
    data: Array.isArray((r.data as any)?.comments) ? (r.data as any).comments : [],
    error: null,
    hasMoreOlder: (r.data as any)?.hasMoreOlder === true,
  }
}

export async function v1ListChannelReactionsForTargets(args: {
  conversationId: string
  targetIds: string[]
}): Promise<{ data: unknown[] | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const r = await fetchJson<{ rows: unknown[] }>(`/api/v1/channels/${encodeURIComponent(cid)}/reactions-for-targets`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetIds: args.targetIds }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : []
  return { data: rows, error: null }
}

export async function v1ListChannelCommentCounts(args: {
  conversationId: string
  postIds: string[]
}): Promise<{ data: unknown[] | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const r = await fetchJson<{ rows: unknown[] }>(`/api/v1/channels/${encodeURIComponent(cid)}/comment-counts`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ postIds: args.postIds }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : []
  return { data: rows, error: null }
}

export async function v1AppendChannelPostRich(args: {
  conversationId: string
  body: string
  meta?: any
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}/posts`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ body: args.body, meta: args.meta ?? null }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1AppendChannelFeedMessage(args: {
  conversationId: string
  kind?: 'text' | 'image' | 'audio'
  body: string
  meta?: any
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}/feed`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ kind: args.kind ?? 'text', body: args.body, meta: args.meta ?? null }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1AppendChannelComment(args: {
  conversationId: string
  postId: string
  body: string
  quoteToMessageId?: string | null
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}/comments`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ postId: args.postId, body: args.body, quoteToMessageId: args.quoteToMessageId ?? null }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

export async function v1EditChannelComment(args: {
  conversationId: string
  messageId: string
  newBody: string
}): Promise<{ error: string | null }> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}/comments/${encodeURIComponent(mid)}`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({ newBody: args.newBody }),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok === false) return { error: typeof data?.error === 'string' ? data.error : 'not_edited' }
  return { error: null }
}

export async function v1DeleteChannelComment(args: {
  conversationId: string
  messageId: string
}): Promise<{ error: string | null }> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}/comments/${encodeURIComponent(mid)}`, {
    method: 'DELETE',
    auth: true,
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok === false) return { error: typeof data?.error === 'string' ? data.error : 'not_deleted' }
  return { error: null }
}

export async function v1EditChannelPostRich(args: {
  conversationId: string
  messageId: string
  newBody: string
  meta?: any
}): Promise<{ error: string | null }> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}/posts/${encodeURIComponent(mid)}`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify({ newBody: args.newBody, meta: args.meta ?? null }),
  })
  if (!r.ok) return { error: r.error.message }
  const data = (r.data as any)?.data
  if (data?.ok === false) return { error: typeof data?.error === 'string' ? data.error : 'not_edited' }
  return { error: null }
}

export async function v1DeleteChannelPost(args: {
  conversationId: string
  messageId: string
}): Promise<{ data: { deleted: number } | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const mid = args.messageId.trim()
  const r = await fetchJson<{ data: any }>(`/api/v1/channels/${encodeURIComponent(cid)}/posts/${encodeURIComponent(mid)}`, {
    method: 'DELETE',
    auth: true,
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const data = (r.data as any)?.data
  const deleted = typeof data?.deleted === 'number' ? data.deleted : Number(data?.deleted ?? 0) || 0
  return { data: { deleted }, error: null }
}

export async function v1ToggleChannelReaction(args: {
  conversationId: string
  targetMessageId: string
  emoji: string
}): Promise<{ data: unknown | null; error: string | null }> {
  const cid = args.conversationId.trim()
  const r = await fetchJson<{ data: unknown }>(`/api/v1/channels/${encodeURIComponent(cid)}/reactions`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ targetMessageId: args.targetMessageId, emoji: args.emoji }),
  })
  if (!r.ok) return { data: null, error: r.error.message }
  return { data: (r.data as any)?.data ?? null, error: null }
}

