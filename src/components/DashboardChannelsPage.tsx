import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useToast } from '../context/ToastContext'
import { DashboardShell } from './DashboardShell'
import { BrandLogoLoader } from './BrandLogoLoader'
import { ChevronLeftIcon, FiRrIcon, MenuBurgerIcon } from './icons'
import { ReactionEmojiPopover } from './ReactionEmojiPopover'
import type { ReactionEmoji } from '../types/roomComms'
import { supabase } from '../lib/supabase'
import {
  appendChannelComment,
  appendChannelPost,
  isAllowedReactionEmoji,
  listChannelCommentsPage,
  listChannelPostsPage,
  listMyChannels,
  markChannelRead,
  toggleChannelMessageReaction,
  type ChannelSummary,
} from '../lib/channels'
import { mapDirectMessageFromRow, type DirectMessage } from '../lib/messenger'

function sortChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

function normalizeSearch(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function DashboardChannelsPage() {
  const { signOut, user } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const toast = useToast()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const channelIdFromUrl = sp.get('channel')?.trim() ?? ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ChannelSummary[]>([])
  const [search, setSearch] = useState('')

  const [activeId, setActiveId] = useState('')
  const activeIdRef = useRef('')
  activeIdRef.current = activeId

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

  const refreshList = useCallback(async () => {
    if (!user?.id) return
    const res = await listMyChannels()
    if (res.error) {
      setError(res.error)
      return
    }
    setError(null)
    setItems(res.data ?? [])
  }, [user?.id])

  useEffect(() => {
    let active = true
    if (!user?.id) return
    setLoading(true)
    setError(null)
    void listMyChannels().then((res) => {
      if (!active) return
      setLoading(false)
      if (res.error) {
        setError(res.error)
        setItems([])
      } else {
        setError(null)
        setItems(res.data ?? [])
      }
    })
    return () => {
      active = false
    }
  }, [user?.id])

  useEffect(() => {
    if (!items.length) return
    const want = channelIdFromUrl || activeIdRef.current
    if (want && items.some((c) => c.id === want)) {
      setActiveId(want)
      return
    }
    setActiveId(items[0]!.id)
  }, [channelIdFromUrl, items])

  const filtered = useMemo(() => {
    const n = normalizeSearch(search)
    if (!n) return items
    return items.filter((c) => (c.title ?? '').toLowerCase().includes(n) || (c.lastMessagePreview ?? '').toLowerCase().includes(n))
  }, [items, search])

  const activeChannel = useMemo(() => items.find((c) => c.id === activeId) ?? null, [items, activeId])

  const loadThread = useCallback(async (cid: string) => {
    if (!cid) return
    setThreadLoading(true)
    setPosts([])
    setReactions([])
    setHasMoreOlder(false)
    setExpandedPostId(null)
    setCommentsByPostId({})
    try {
      const res = await listChannelPostsPage(cid, { limit: 30 })
      if (activeIdRef.current !== cid) return
      if (res.error) {
        setError(res.error)
        return
      }
      setError(null)
      setPosts(res.data ?? [])
      setHasMoreOlder(res.hasMoreOlder)
      void markChannelRead(cid)
      setItems((prev) => prev.map((it) => (it.id === cid ? { ...it, unreadCount: 0 } : it)))
    } finally {
      if (activeIdRef.current === cid) setThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!activeId || !user?.id) return

    const channel = supabase.channel(`channels:${activeId}`)
    const filter = `conversation_id=eq.${activeId}`

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const msg = mapDirectMessageFromRow(row)
          if (!msg.id || msg.senderUserId === user.id) return

          const cid = activeIdRef.current
          if (!cid) return

          if (msg.kind === 'reaction') {
            setReactions((prev) => {
              if (prev.some((r) => r.id === msg.id)) return prev
              return [...prev, msg].sort(sortChrono)
            })
            return
          }

          // post (replyToMessageId null) or comment (replyToMessageId = postId)
          if (!msg.replyToMessageId) {
            setPosts((prev) => {
              if (prev.some((p) => p.id === msg.id)) return prev
              return [...prev, msg].sort(sortChrono)
            })
          } else if (expandedPostId === msg.replyToMessageId || commentsByPostId[msg.replyToMessageId]) {
            const postId = msg.replyToMessageId
            setCommentsByPostId((prev) => {
              const cur = prev[postId] ?? []
              if (cur.some((c) => c.id === msg.id)) return prev
              return { ...prev, [postId]: [...cur, msg].sort(sortChrono) }
            })
          }

          // Update list preview & unread if channel isn't open (or tab isn't visible).
          setItems((prev) =>
            prev.map((it) => {
              if (it.id !== cid) return it
              const incUnread = document.visibilityState !== 'visible' ? 1 : 0
              return {
                ...it,
                lastMessageAt: msg.createdAt,
                lastMessagePreview: msg.body,
                messageCount: it.messageCount + 1,
                unreadCount: it.unreadCount + incUnread,
              }
            }),
          )

          if (document.visibilityState === 'visible') void markChannelRead(cid)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const msg = mapDirectMessageFromRow(row)
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
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeId, user?.id, expandedPostId, commentsByPostId])

  useEffect(() => {
    if (!activeId) return
    void loadThread(activeId)
  }, [activeId, loadThread])

  const loadOlder = useCallback(async () => {
    if (!activeId || loadingOlder || !hasMoreOlder) return
    const oldest = posts[0]
    if (!oldest?.id) return
    setLoadingOlder(true)
    try {
      const res = await listChannelPostsPage(activeId, { limit: 30, before: { createdAt: oldest.createdAt, id: oldest.id } })
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
  }, [activeId, loadingOlder, hasMoreOlder, posts])

  const openChannel = (cid: string) => {
    navigate(`/dashboard/channels?channel=${encodeURIComponent(cid)}`)
    setActiveId(cid)
  }

  const sendPost = useCallback(async () => {
    const cid = activeId.trim()
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
      setPosts((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...optimistic, id: finalId, createdAt: finalAt } : m)).sort(sortChrono),
      )
      setItems((prev) =>
        prev.map((it) =>
          it.id === cid
            ? { ...it, lastMessageAt: finalAt, lastMessagePreview: body, messageCount: it.messageCount + 1, unreadCount: 0 }
            : it,
        ),
      )
    } finally {
      setSendingPost(false)
    }
  }, [activeId, draftPost, sendingPost, user?.id])

  const toggleComments = useCallback(
    async (postId: string) => {
      if (!activeId || !postId) return
      if (expandedPostId === postId) {
        setExpandedPostId(null)
        return
      }
      setExpandedPostId(postId)
      if (commentsByPostId[postId]) return
      setCommentsLoadingPostId(postId)
      try {
        const res = await listChannelCommentsPage(activeId, postId, { limit: 60 })
        if (res.error) {
          setError(res.error)
          return
        }
        setCommentsByPostId((prev) => ({ ...prev, [postId]: res.data ?? [] }))
      } finally {
        setCommentsLoadingPostId(null)
      }
    },
    [activeId, expandedPostId, commentsByPostId],
  )

  const sendComment = useCallback(
    async (postId: string) => {
      const cid = activeId.trim()
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
    },
    [activeId, draftCommentByPostId, sendingCommentPostId, user?.id],
  )

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

  const toggleReaction = useCallback(
    async (targetMessageId: string, emoji: ReactionEmoji) => {
      const cid = activeId.trim()
      if (!cid || !isAllowedReactionEmoji(emoji)) return
      const res = await toggleChannelMessageReaction(cid, targetMessageId, emoji)
      if (res.error || !res.data) {
        toast.push({ tone: 'error', message: res.error ?? 'Не удалось поставить реакцию.', ms: 2800 })
        return
      }
      // Optimistic sync via reloading comments/posts is heavy; just refetch the specific comments list if open.
      // Here we do a simple refresh of visible lists for correctness.
      if (expandedPostId && expandedPostId === targetMessageId) {
        // no-op
      }
      void refreshList()
      if (expandedPostId) {
        void toggleComments(expandedPostId)
        setTimeout(() => void toggleComments(expandedPostId), 0)
      }
      void loadThread(cid)
    },
    [activeId, toast, refreshList, expandedPostId, toggleComments, loadThread],
  )

  const renderMessage = (m: DirectMessage, isComment = false) => {
    if (m.kind === 'reaction') return null
    const reacts = reactionsByTargetId.get(m.id) ?? []
    const counts = new Map<string, number>()
    for (const r of reacts) counts.set(r.body, (counts.get(r.body) ?? 0) + 1)
    const rows = [...counts.entries()]
    return (
      <article key={m.id} className={`dashboard-messenger__message${isComment ? ' dashboard-messenger__message--reply' : ''}`}>
        <div className="dashboard-messenger__message-meta">
          <div className="dashboard-messenger__message-meta-main">
            <span className="dashboard-messenger__message-author">{m.senderNameSnapshot}</span>
            <time className="dashboard-messenger__message-time" dateTime={m.createdAt}>
              {new Date(m.createdAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
        </div>
        <div className="dashboard-messenger__message-body">{m.body}</div>
        <div className="dashboard-messenger__message-reactions">
          {rows.map(([emoji, count]) => (
            <span key={emoji} className="dashboard-messenger__reaction-chip">
              <span className="dashboard-messenger__reaction-emoji">{emoji}</span>
              {count > 1 ? <span className="dashboard-messenger__reaction-count">{count}</span> : null}
            </span>
          ))}
          <button
            type="button"
            className="dashboard-messenger__reaction-add"
            onClick={() => setReactOpenFor(m.id)}
            aria-label="Добавить реакцию"
            title="Реакция"
          >
            <FiRrIcon name="add" />
          </button>
        </div>
      </article>
    )
  }

  return (
    <DashboardShell active="cabinet" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()} showMessengerTileInQuickMenu={false}>
      <section className="dashboard-section dashboard-messenger dashboard-messenger--fill">
        {error ? <p className="join-error">{error}</p> : null}
        <div className="dashboard-messenger__layout">
          <aside className="dashboard-messenger__list" aria-label="Список каналов">
            <header className="dashboard-messenger__list-head">
              <Link to="/dashboard" className="dashboard-messenger__list-head-back" title="Назад" aria-label="Назад">
                <ChevronLeftIcon />
              </Link>
              <input
                type="search"
                className="dashboard-messenger__list-head-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по каналам…"
                autoComplete="off"
              />
              <div className="dashboard-messenger__list-head-actions">
                <button type="button" className="dashboard-messenger__list-head-btn" title="Обновить" onClick={() => void refreshList()}>
                  <MenuBurgerIcon />
                </button>
              </div>
            </header>
            <div className="dashboard-messenger__list-scroll">
              {loading ? (
                <div className="dashboard-messenger__pane-loader" aria-label="Загрузка списка…">
                  <BrandLogoLoader size={56} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="dashboard-chats-empty">Каналов пока нет.</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`dashboard-messenger__row${c.id === activeId ? ' dashboard-messenger__row--active' : ''}`}
                    onClick={() => openChannel(c.id)}
                  >
                    <div className="dashboard-messenger__row-main">
                      <span className="dashboard-messenger__row-avatar" aria-hidden>
                        <span>{(c.title.trim().charAt(0) || 'К').toUpperCase()}</span>
                      </span>
                      <div className="dashboard-messenger__row-content">
                        <div className="dashboard-messenger__row-titleline">
                          <div className="dashboard-messenger__row-title">{c.title}</div>
                          <div className="dashboard-messenger__row-aside">
                            {c.unreadCount > 0 ? (
                              <span className="dashboard-messenger__row-badge">
                                {c.unreadCount > 99 ? '99+' : c.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="dashboard-messenger__row-preview">{c.lastMessagePreview?.trim() || 'Пока без постов'}</div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>

          <div className="dashboard-messenger__thread">
            {threadLoading ? (
              <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…">
                <BrandLogoLoader size={56} />
              </div>
            ) : !activeChannel ? (
              <div className="dashboard-chats-empty">Выберите канал слева.</div>
            ) : (
              <>
                <div className="dashboard-messenger__thread-head">
                  <div className="dashboard-messenger__thread-head-desktop">
                    <h3 className="dashboard-section__subtitle">{activeChannel.title}</h3>
                    <span className="dashboard-messenger__thread-head-sub">
                      {activeChannel.postingMode === 'admins_only' ? 'Посты: только админы' : 'Посты: все'}
                      {activeChannel.commentsMode === 'disabled' ? ' • Комменты: выкл' : ' • Комменты: вкл'}
                    </span>
                  </div>
                </div>

                <div className="dashboard-messenger__messages-scroll" role="region" aria-label="Посты канала">
                  {hasMoreOlder ? (
                    <div style={{ padding: 10, textAlign: 'center' }}>
                      <button type="button" className="dashboard-topbar__action" disabled={loadingOlder} onClick={() => void loadOlder()}>
                        {loadingOlder ? 'Загрузка…' : 'Показать старше'}
                      </button>
                    </div>
                  ) : null}

                  {posts.filter((m) => m.kind !== 'reaction').length === 0 ? (
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
                              {commentsLoadingPostId === p.id ? (
                                <div className="auth-loading auth-loading--inline" aria-label="Загрузка..." />
                              ) : null}
                              {(commentsByPostId[p.id] ?? []).filter((m) => m.kind !== 'reaction').map((c) => renderMessage(c, true))}
                              {activeChannel.commentsMode === 'disabled' ? (
                                <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 8 }}>Комментарии отключены.</div>
                              ) : (
                                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                  <input
                                    className="dashboard-messenger__input"
                                    value={draftCommentByPostId[p.id] ?? ''}
                                    placeholder="Комментарий…"
                                    onChange={(e) =>
                                      setDraftCommentByPostId((prev) => ({ ...prev, [p.id]: e.target.value }))
                                    }
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
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))
                  )}
                </div>

                <div className="dashboard-messenger__composer" role="region" aria-label="Новый пост">
                  <div className="dashboard-messenger__composer-main">
                    <textarea
                      className="dashboard-messenger__input"
                      rows={3}
                      placeholder="Новый пост…"
                      value={draftPost}
                      disabled={threadLoading}
                      onChange={(e) => setDraftPost(e.target.value)}
                    />
                    <div className="dashboard-messenger__composer-side">
                      <button
                        type="button"
                        className="dashboard-topbar__action dashboard-topbar__action--primary"
                        disabled={!draftPost.trim() || sendingPost || threadLoading}
                        onClick={() => void sendPost()}
                      >
                        Опубликовать
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

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
                void toggleReaction(reactOpenFor, em)
                setReactOpenFor(null)
              }}
            />
          </div>
        </div>
      ) : null}
    </DashboardShell>
  )
}

