import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { mapDirectMessageFromRow, type DirectMessage } from '../../lib/messenger'
import {
  appendChannelComment,
  appendChannelPost,
  isAllowedReactionEmoji,
  listChannelCommentsPage,
  listChannelPostsPage,
  markChannelRead,
  toggleChannelMessageReaction,
} from '../../lib/channels'
import type { ReactionEmoji } from '../../types/roomComms'
import { FiRrIcon } from '../icons'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'

function sortChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

export function ChannelThreadPane({
  conversationId,
  onTouchTail,
}: {
  conversationId: string
  onTouchTail?: (patch: { lastMessageAt: string; lastMessagePreview: string }) => void
}) {
  const { user } = useAuth()
  const toast = useToast()

  const [error, setError] = useState<string | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [posts, setPosts] = useState<DirectMessage[]>([])
  const [reactions, setReactions] = useState<DirectMessage[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draftPost, setDraftPost] = useState('')
  const [sendingPost, setSendingPost] = useState(false)
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, DirectMessage[]>>({})
  const [commentsLoadingPostId, setCommentsLoadingPostId] = useState<string | null>(null)
  const [draftCommentByPostId, setDraftCommentByPostId] = useState<Record<string, string>>({})
  const [sendingCommentPostId, setSendingCommentPostId] = useState<string | null>(null)
  const [reactOpenFor, setReactOpenFor] = useState<string | null>(null)

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId

  useEffect(() => {
    let active = true
    const cid = conversationId.trim()
    if (!user?.id || !cid) return
    setThreadLoading(true)
    setError(null)
    setPosts([])
    setReactions([])
    setExpandedPostId(null)
    setCommentsByPostId({})
    void listChannelPostsPage(cid, { limit: 30 }).then((res) => {
      if (!active) return
      setThreadLoading(false)
      if (res.error) {
        setError(res.error)
        return
      }
      setPosts(res.data ?? [])
      setHasMoreOlder(res.hasMoreOlder)
      void markChannelRead(cid)
    })
    return () => {
      active = false
    }
  }, [conversationId, user?.id])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !user?.id) return
    const channel = supabase.channel(`channel-thread:${cid}`)
    const filter = `conversation_id=eq.${cid}`
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const msg = mapDirectMessageFromRow(payload.new as Record<string, unknown>)
        if (!msg.id) return
        if (msg.senderUserId === user.id && msg.kind !== 'reaction') return
        if (cidRef.current.trim() !== cid) return
        if (msg.kind === 'reaction') {
          setReactions((prev) => (prev.some((r) => r.id === msg.id) ? prev : [...prev, msg].sort(sortChrono)))
          return
        }
        if (!msg.replyToMessageId) {
          setPosts((prev) => (prev.some((p) => p.id === msg.id) ? prev : [...prev, msg].sort(sortChrono)))
          onTouchTail?.({ lastMessageAt: msg.createdAt, lastMessagePreview: msg.body })
        } else {
          const postId = msg.replyToMessageId
          setCommentsByPostId((prev) => {
            const cur = prev[postId]
            if (!cur) return prev
            if (cur.some((c) => c.id === msg.id)) return prev
            return { ...prev, [postId]: [...cur, msg].sort(sortChrono) }
          })
        }
        if (document.visibilityState === 'visible') void markChannelRead(cid)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const msg = mapDirectMessageFromRow(payload.new as Record<string, unknown>)
        if (!msg.id) return
        const patchOne = (m: DirectMessage): DirectMessage => (m.id === msg.id ? { ...m, ...msg } : m)
        if (msg.kind === 'reaction') {
          setReactions((prev) => prev.map(patchOne))
          return
        }
        if (!msg.replyToMessageId) {
          setPosts((prev) => prev.map(patchOne))
          return
        }
        const postId = msg.replyToMessageId
        setCommentsByPostId((prev) => {
          const cur = prev[postId]
          if (!cur) return prev
          return { ...prev, [postId]: cur.map(patchOne) }
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user?.id, onTouchTail])

  const allMessagesForReactions = useMemo(() => {
    const m: DirectMessage[] = []
    for (const p of posts) m.push(p)
    for (const arr of Object.values(commentsByPostId)) m.push(...arr)
    for (const r of reactions) m.push(r)
    return m
  }, [posts, commentsByPostId, reactions])

  const reactionsByTargetId = useMemo(() => {
    const map = new Map<string, DirectMessage[]>()
    for (const m of allMessagesForReactions) {
      if (m.kind !== 'reaction') continue
      const tid = m.meta?.react_to?.trim()
      if (!tid) continue
      const arr = map.get(tid) ?? []
      arr.push(m)
      map.set(tid, arr)
    }
    for (const [, arr] of map) arr.sort(sortChrono)
    return map
  }, [allMessagesForReactions])

  const loadOlder = useCallback(async () => {
    const cid = conversationId.trim()
    if (!cid || loadingOlder || !hasMoreOlder) return
    const oldest = posts[0]
    if (!oldest?.id) return
    setLoadingOlder(true)
    try {
      const res = await listChannelPostsPage(cid, { limit: 30, before: { createdAt: oldest.createdAt, id: oldest.id } })
      if (res.error) {
        setError(res.error)
        return
      }
      setHasMoreOlder(res.hasMoreOlder)
      setPosts((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        const merged = [...(res.data ?? []).filter((m) => !seen.has(m.id)), ...prev]
        merged.sort(sortChrono)
        return merged
      })
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, loadingOlder, hasMoreOlder, posts])

  const sendPost = useCallback(async () => {
    const cid = conversationId.trim()
    const body = draftPost.trim()
    if (!user?.id || !cid || !body || sendingPost) return
    setSendingPost(true)
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: 'Вы',
      kind: 'text',
      body,
      createdAt: new Date().toISOString(),
      replyToMessageId: null,
    }
    setPosts((prev) => [...prev, optimistic].sort(sortChrono))
    setDraftPost('')
    try {
      const res = await appendChannelPost(cid, body)
      if (res.error) {
        setError(res.error)
        setPosts((prev) => prev.filter((m) => m.id !== optimistic.id))
        setDraftPost(body)
        return
      }
      const finalId = res.data?.messageId ?? optimistic.id
      const finalAt = res.data?.createdAt ?? optimistic.createdAt
      setPosts((prev) => prev.map((m) => (m.id === optimistic.id ? { ...optimistic, id: finalId, createdAt: finalAt } : m)).sort(sortChrono))
      onTouchTail?.({ lastMessageAt: finalAt, lastMessagePreview: body })
    } finally {
      setSendingPost(false)
    }
  }, [conversationId, draftPost, sendingPost, user?.id, onTouchTail])

  const toggleComments = useCallback(async (postId: string) => {
    const cid = conversationId.trim()
    if (!cid || !postId) return
    if (expandedPostId === postId) {
      setExpandedPostId(null)
      return
    }
    setExpandedPostId(postId)
    if (commentsByPostId[postId]) return
    setCommentsLoadingPostId(postId)
    try {
      const res = await listChannelCommentsPage(cid, postId, { limit: 60 })
      if (res.error) {
        setError(res.error)
        return
      }
      setCommentsByPostId((prev) => ({ ...prev, [postId]: res.data ?? [] }))
    } finally {
      setCommentsLoadingPostId(null)
    }
  }, [conversationId, expandedPostId, commentsByPostId])

  const sendComment = useCallback(async (postId: string) => {
    const cid = conversationId.trim()
    const body = (draftCommentByPostId[postId] ?? '').trim()
    if (!user?.id || !cid || !postId || !body || sendingCommentPostId) return
    setSendingCommentPostId(postId)
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: 'Вы',
      kind: 'text',
      body,
      createdAt: new Date().toISOString(),
      replyToMessageId: postId,
    }
    setCommentsByPostId((prev) => {
      const cur = prev[postId] ?? []
      return { ...prev, [postId]: [...cur, optimistic].sort(sortChrono) }
    })
    setDraftCommentByPostId((prev) => ({ ...prev, [postId]: '' }))
    try {
      const res = await appendChannelComment(cid, postId, body)
      if (res.error) {
        setError(res.error)
        setCommentsByPostId((prev) => {
          const cur = prev[postId] ?? []
          return { ...prev, [postId]: cur.filter((m) => m.id !== optimistic.id) }
        })
        setDraftCommentByPostId((prev) => ({ ...prev, [postId]: body }))
        return
      }
      const finalId = res.data?.messageId ?? optimistic.id
      const finalAt = res.data?.createdAt ?? optimistic.createdAt
      setCommentsByPostId((prev) => {
        const cur = prev[postId] ?? []
        return { ...prev, [postId]: cur.map((m) => (m.id === optimistic.id ? { ...optimistic, id: finalId, createdAt: finalAt } : m)).sort(sortChrono) }
      })
    } finally {
      setSendingCommentPostId(null)
    }
  }, [conversationId, draftCommentByPostId, sendingCommentPostId, user?.id])

  const toggleReaction = useCallback(async (targetMessageId: string, emoji: ReactionEmoji) => {
    const cid = conversationId.trim()
    if (!cid || !isAllowedReactionEmoji(emoji)) return
    const res = await toggleChannelMessageReaction(cid, targetMessageId, emoji)
    if (res.error) toast.push({ tone: 'error', message: res.error, ms: 2600 })
  }, [conversationId, toast])

  const renderMessage = (m: DirectMessage, isComment = false) => {
    if (m.kind === 'reaction') return null
    const reacts = reactionsByTargetId.get(m.id) ?? []
    const counts = new Map<string, number>()
    for (const r of reacts) counts.set(r.body, (counts.get(r.body) ?? 0) + 1)
    const rows = [...counts.entries()]
    return (
      <article key={m.id} className={`dashboard-messenger__message${isComment ? ' dashboard-messenger__message--reply' : ''}`}>
        <div className="dashboard-messenger__message-body">{m.body}</div>
        <div className="dashboard-messenger__message-reactions">
          {rows.map(([emoji, count]) => (
            <span key={emoji} className="dashboard-messenger__reaction-chip">
              <span className="dashboard-messenger__reaction-emoji">{emoji}</span>
              {count > 1 ? <span className="dashboard-messenger__reaction-count">{count}</span> : null}
            </span>
          ))}
          <button type="button" className="dashboard-messenger__reaction-add" onClick={() => setReactOpenFor(m.id)}>
            <FiRrIcon name="add" />
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="dashboard-messenger__thread-body">
      {error ? <p className="join-error">{error}</p> : null}

      <div className="dashboard-messenger__messages-scroll" role="region" aria-label="Посты канала">
        {hasMoreOlder ? (
          <div style={{ padding: 10, textAlign: 'center' }}>
            <button type="button" className="dashboard-topbar__action" disabled={loadingOlder} onClick={() => void loadOlder()}>
              {loadingOlder ? 'Загрузка…' : 'Показать старше'}
            </button>
          </div>
        ) : null}

        {threadLoading ? (
          <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" />
        ) : posts.filter((m) => m.kind !== 'reaction').length === 0 ? (
          <div className="dashboard-chats-empty">Пока нет постов.</div>
        ) : (
          posts
            .filter((m) => m.kind !== 'reaction')
            .map((p) => (
              <div key={p.id} style={{ padding: '10px 12px' }}>
                {renderMessage(p)}
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <button type="button" className="dashboard-topbar__action" onClick={() => void toggleComments(p.id)}>
                    {expandedPostId === p.id ? 'Скрыть комментарии' : 'Комментарии'}
                  </button>
                </div>
                {expandedPostId === p.id ? (
                  <div style={{ marginTop: 10, paddingLeft: 14, borderLeft: '2px solid var(--border)' }}>
                    {commentsLoadingPostId === p.id ? <div className="auth-loading auth-loading--inline" aria-label="Загрузка..." /> : null}
                    {(commentsByPostId[p.id] ?? []).filter((m) => m.kind !== 'reaction').map((c) => renderMessage(c, true))}
                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                      <input
                        className="dashboard-messenger__input"
                        value={draftCommentByPostId[p.id] ?? ''}
                        placeholder="Комментарий…"
                        onChange={(e) => setDraftCommentByPostId((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="dashboard-topbar__action dashboard-topbar__action--primary"
                        disabled={sendingCommentPostId === p.id || !(draftCommentByPostId[p.id] ?? '').trim()}
                        onClick={() => void sendComment(p.id)}
                      >
                        Отправить
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
        )}
      </div>

      <div className="dashboard-messenger__composer" role="region" aria-label="Новый пост">
        <div className="dashboard-messenger__composer-main">
          <textarea className="dashboard-messenger__input" rows={3} placeholder="Новый пост…" value={draftPost} disabled={threadLoading} onChange={(e) => setDraftPost(e.target.value)} />
          <div className="dashboard-messenger__composer-side">
            <button type="button" className="dashboard-topbar__action dashboard-topbar__action--primary" disabled={!draftPost.trim() || sendingPost || threadLoading} onClick={() => void sendPost()}>
              Опубликовать
            </button>
          </div>
        </div>
      </div>

      {reactOpenFor ? (
        <div className="confirm-dialog-root">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={() => setReactOpenFor(null)} />
          <div className="confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <ReactionEmojiPopover
              title="Реакция"
              emojis={['👍', '👏', '❤️', '😂', '🔥', '✋', '🖖']}
              onClose={() => setReactOpenFor(null)}
              onPick={(em) => {
                if (!reactOpenFor || !isAllowedReactionEmoji(em)) return
                void toggleReaction(reactOpenFor, em as ReactionEmoji)
                setReactOpenFor(null)
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

