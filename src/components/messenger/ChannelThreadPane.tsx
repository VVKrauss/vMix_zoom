import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../../utils/popoverOutsideClick'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { mapDirectMessageFromRow, type DirectMessage } from '../../lib/messenger'
import { getMessengerImageSignedUrl } from '../../lib/messenger'
import {
  appendChannelComment,
  deleteChannelPost,
  isAllowedReactionEmoji,
  listChannelCommentsPage,
  listChannelPostsPage,
  markChannelRead,
  toggleChannelMessageReaction,
} from '../../lib/channels'
import { collectStoragePathsFromDraft } from '../../lib/postEditor/draftUtils'
import type { ReactionEmoji } from '../../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../../types/roomComms'
import { FiRrIcon } from '../icons'
import { MessengerMessageMenuPopover } from '../MessengerMessageMenuPopover'
import { PostDraftReadView, PostPublicationLine } from '../postEditor/PostDraftReadView'
import { PostEditorModal } from '../postEditor/PostEditorModal'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function extractStoragePathsFromMarkdown(md: string): string[] {
  const out: string[] = []
  const re = /\bms:\/\/([^\s)]+)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const p = (m[1] ?? '').trim()
    if (p) out.push(p)
  }
  return out
}

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
  const [postEditor, setPostEditor] = useState<null | { mode: 'create' } | { mode: 'edit'; message: DirectMessage }>(null)
  const [commentsModalPostId, setCommentsModalPostId] = useState<string | null>(null)
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, DirectMessage[]>>({})
  const [commentCountByPostId, setCommentCountByPostId] = useState<Record<string, number>>({})
  const [commentCountHasMoreByPostId, setCommentCountHasMoreByPostId] = useState<Record<string, boolean>>({})
  const [commentsLoadingPostId, setCommentsLoadingPostId] = useState<string | null>(null)
  const [draftCommentByPostId, setDraftCommentByPostId] = useState<Record<string, string>>({})
  const [sendingCommentPostId, setSendingCommentPostId] = useState<string | null>(null)
  const [reactionPick, setReactionPick] = useState<{
    targetId: string
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [postMenu, setPostMenu] = useState<{
    post: DirectMessage
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const postMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const reactionPickWrapRef = useRef<HTMLDivElement | null>(null)
  const seenChannelCommentIdsRef = useRef<Set<string>>(new Set())
  const [signedUrlByPath, setSignedUrlByPath] = useState<Record<string, string>>({})

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId

  const reloadPosts = useCallback(() => {
    const cid = conversationId.trim()
    if (!user?.id || !cid) return
    void listChannelPostsPage(cid, { limit: 30 }).then((res) => {
      if (res.error) {
        setError(res.error)
        return
      }
      setPosts(res.data ?? [])
      setHasMoreOlder(res.hasMoreOlder)
      const list = (res.data ?? []).filter((m) => m.kind !== 'reaction')
      if (list.length > 0) {
        const sorted = [...list].sort(sortChrono)
        const tail = sorted[sorted.length - 1]!
        onTouchTail?.({ lastMessageAt: tail.createdAt, lastMessagePreview: tail.body })
      }
    })
  }, [conversationId, user?.id, onTouchTail])

  useEffect(() => {
    let active = true
    const cid = conversationId.trim()
    if (!user?.id || !cid) return
    setThreadLoading(true)
    setError(null)
    setPosts([])
    setReactions([])
    setCommentsModalPostId(null)
    setCommentsByPostId({})
    setCommentCountByPostId({})
    setCommentCountHasMoreByPostId({})
    seenChannelCommentIdsRef.current.clear()
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
          if (seenChannelCommentIdsRef.current.has(msg.id)) return
          seenChannelCommentIdsRef.current.add(msg.id)
          setCommentCountByPostId((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
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

  useEffect(() => {
    let active = true
    const paths = new Set<string>()
    for (const p of posts) {
      for (const sp of extractStoragePathsFromMarkdown(p.body ?? '')) paths.add(sp)
      const pd = p.meta?.postDraft
      if (pd) for (const sp of collectStoragePathsFromDraft(pd)) paths.add(sp)
    }
    for (const arr of Object.values(commentsByPostId)) {
      for (const c of arr) {
        for (const sp of extractStoragePathsFromMarkdown(c.body ?? '')) paths.add(sp)
      }
    }
    const missing = [...paths].filter((p) => !signedUrlByPath[p])
    if (missing.length === 0) return
    void (async () => {
      for (const p of missing) {
        const signed = await getMessengerImageSignedUrl(p, 3600)
        if (!active) return
        if (signed.url) setSignedUrlByPath((prev) => (prev[p] ? prev : { ...prev, [p]: signed.url! }))
      }
    })()
    return () => {
      active = false
    }
  }, [posts, commentsByPostId, signedUrlByPath])

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

  const openCommentsModal = useCallback(async (postId: string) => {
    const cid = conversationId.trim()
    if (!cid || !postId) return
    setCommentsModalPostId(postId)

    let skipFetch = false
    setCommentsByPostId((prev) => {
      const cur = prev[postId]
      if (cur && cur.length > 0) skipFetch = true
      return cur ? prev : { ...prev, [postId]: [] }
    })

    if (skipFetch) return

    setCommentsLoadingPostId(postId)
    try {
      const res = await listChannelCommentsPage(cid, postId, { limit: 60 })
      if (res.error) {
        setError(res.error)
        return
      }
      const rows = res.data ?? []
      setCommentsByPostId((prev) => ({ ...prev, [postId]: rows }))
      const nonR = rows.filter((m) => m.kind !== 'reaction')
      setCommentCountHasMoreByPostId((prev) => ({ ...prev, [postId]: res.hasMoreOlder }))
      if (res.hasMoreOlder) {
        setCommentCountByPostId((prev) => ({ ...prev, [postId]: Math.max(prev[postId] ?? 0, nonR.length) }))
      } else {
        setCommentCountByPostId((prev) => ({ ...prev, [postId]: nonR.length }))
      }
    } finally {
      setCommentsLoadingPostId(null)
    }
  }, [conversationId])

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
    setCommentCountByPostId((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
    setDraftCommentByPostId((prev) => ({ ...prev, [postId]: '' }))
    try {
      const res = await appendChannelComment(cid, postId, body)
      if (res.error) {
        setError(res.error)
        setCommentCountByPostId((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }))
        setCommentsByPostId((prev) => {
          const cur = prev[postId] ?? []
          return { ...prev, [postId]: cur.filter((m) => m.id !== optimistic.id) }
        })
        setDraftCommentByPostId((prev) => ({ ...prev, [postId]: body }))
        return
      }
      const finalId = res.data?.messageId ?? optimistic.id
      const finalAt = res.data?.createdAt ?? optimistic.createdAt
      if (finalId && !finalId.startsWith('local-')) seenChannelCommentIdsRef.current.add(finalId)
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

  /** Добавить реакцию (ПКМ / меню / + у комментария). Повторно ту же эмодзи нельзя — только снять со своего чипа. */
  const addReactionOnly = useCallback(
    async (targetMessageId: string, emoji: ReactionEmoji) => {
      const cid = conversationId.trim()
      if (!cid || !user?.id || !isAllowedReactionEmoji(emoji)) return
      const reacts = reactionsByTargetId.get(targetMessageId) ?? []
      const already = reacts.some(
        (r) => r.senderUserId === user.id && (r.body.trim() || r.body) === emoji,
      )
      if (already) {
        toast.push({ tone: 'info', message: 'Эта реакция уже стоит', ms: 2200 })
        return
      }
      const res = await toggleChannelMessageReaction(cid, targetMessageId, emoji)
      if (res.error) toast.push({ tone: 'error', message: res.error, ms: 2600 })
    },
    [conversationId, reactionsByTargetId, toast, user?.id],
  )

  const onReactionChipTap = useCallback(
    async (targetMessageId: string, emoji: string) => {
      if (!isAllowedReactionEmoji(emoji)) return
      await toggleReaction(targetMessageId, emoji)
    },
    [toggleReaction],
  )

  const runDeletePost = useCallback(
    async (postId: string) => {
      const cid = conversationId.trim()
      if (!user?.id || !cid || !postId || deleteBusy) return
      setDeleteBusy(true)
      setError(null)
      try {
        const res = await deleteChannelPost(cid, postId)
        if (res.error) {
          setError(res.error)
          return
        }
        setPosts((prev) => prev.filter((m) => m.id !== postId))
        setCommentsByPostId((prev) => {
          if (!prev[postId]) return prev
          const { [postId]: _, ...rest } = prev
          return rest
        })
        setCommentCountByPostId((prev) => {
          if (!(postId in prev)) return prev
          const { [postId]: _, ...rest } = prev
          return rest
        })
        setCommentCountHasMoreByPostId((prev) => {
          if (!(postId in prev)) return prev
          const { [postId]: _, ...rest } = prev
          return rest
        })
        if (commentsModalPostId === postId) setCommentsModalPostId(null)
      } finally {
        setDeleteBusy(false)
      }
    },
    [commentsModalPostId, conversationId, deleteBusy, user?.id],
  )

  useLayoutEffect(() => {
    const el = postMenuWrapRef.current
    if (!el || !postMenu) return
    const { anchor } = postMenu
    const place = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) {
        requestAnimationFrame(place)
        return
      }
      const pad = 10
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = anchor.left
      let top = anchor.bottom + 6
      if (left + rect.width > vw - pad) left = vw - pad - rect.width
      if (left < pad) left = pad
      if (top + rect.height > vh - pad) top = anchor.top - rect.height - 6
      if (top < pad) top = pad
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.visibility = 'visible'
    }
    el.style.visibility = 'hidden'
    place()
  }, [postMenu])

  useLayoutEffect(() => {
    const el = reactionPickWrapRef.current
    if (!el || !reactionPick) return
    const { anchor } = reactionPick
    const place = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) {
        requestAnimationFrame(place)
        return
      }
      const pad = 10
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = anchor.left
      let top = anchor.bottom + 6
      if (left + rect.width > vw - pad) left = vw - pad - rect.width
      if (left < pad) left = pad
      if (top + rect.height > vh - pad) top = anchor.top - rect.height - 6
      if (top < pad) top = pad
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.visibility = 'visible'
    }
    el.style.visibility = 'hidden'
    place()
  }, [reactionPick])

  useEffect(() => {
    if (!postMenu) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0] ? (e.touches[0]!.target as EventTarget) : (e as MouseEvent).target
      if (shouldClosePopoverOnOutsidePointer(postMenuWrapRef.current, target)) setPostMenu(null)
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [postMenu])

  useEffect(() => {
    if (!reactionPick) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReactionPick(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reactionPick])

  useEffect(() => {
    if (!postMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPostMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [postMenu])

  const renderMarkdownAndPreview = (m: DirectMessage, bodyClassName?: string) => {
    if (m.kind === 'reaction') return null
    const link = m.meta?.link?.url?.trim() ? m.meta.link : null
    const md = (
      <>
        <div className="messenger-message-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children, ...props }) => (
                <a {...props} href={href} className="messenger-message-link" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              img: ({ src, alt, ...props }) => {
                const raw = (src ?? '').trim()
                const storagePath = raw.startsWith('ms://') ? raw.slice('ms://'.length) : null
                const resolved = storagePath ? signedUrlByPath[storagePath] : raw
                if (!resolved) return null
                return (
                  <img
                    {...props}
                    src={resolved}
                    alt={alt ?? ''}
                    style={{ maxWidth: '100%', borderRadius: 12, display: 'block', marginTop: 8 }}
                    loading="lazy"
                    decoding="async"
                  />
                )
              },
            }}
          >
            {m.body}
          </ReactMarkdown>
        </div>
        {link ? (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="messenger-message-link"
            style={{
              display: 'block',
              marginTop: 10,
              padding: 10,
              border: '1px solid var(--border)',
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {link.image ? (
                <img
                  src={link.image}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10, flex: '0 0 auto' }}
                  loading="lazy"
                  decoding="async"
                />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {link.title ?? link.siteName ?? link.url}
                </div>
                {link.description ? (
                  <div style={{ opacity: 0.85, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {link.description}
                  </div>
                ) : null}
                <div style={{ opacity: 0.7, marginTop: 4, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {link.siteName ?? new URL(link.url).host}
                </div>
              </div>
            </div>
            </a>
          ) : null}
      </>
    )
    if (bodyClassName) return <div className={bodyClassName}>{md}</div>
    return md
  }

  const renderReactionChips = (
    m: DirectMessage,
    containerClassName: string,
    opts?: { showAddButton?: boolean },
  ) => {
    if (m.kind === 'reaction') return null
    const showAdd = opts?.showAddButton !== false
    const reacts = reactionsByTargetId.get(m.id) ?? []
    const counts = new Map<string, number>()
    for (const r of reacts) counts.set(r.body, (counts.get(r.body) ?? 0) + 1)
    const rows = [...counts.entries()]
    const mine = (emoji: string) => Boolean(user?.id && reacts.some((r) => r.senderUserId === user.id && (r.body.trim() || r.body) === emoji))
    return (
      <div className={containerClassName}>
        {rows.map(([emoji, count]) => (
          <span
            key={emoji}
            className={`dashboard-messenger__reaction-chip${mine(emoji) ? ' dashboard-messenger__reaction-chip--mine' : ''}`}
            role={mine(emoji) ? 'button' : undefined}
            tabIndex={mine(emoji) ? 0 : undefined}
            onClick={
              mine(emoji)
                ? (e) => {
                    e.stopPropagation()
                    void onReactionChipTap(m.id, emoji)
                  }
                : undefined
            }
            onKeyDown={
              mine(emoji)
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      void onReactionChipTap(m.id, emoji)
                    }
                  }
                : undefined
            }
          >
            <span className="dashboard-messenger__reaction-emoji">{emoji}</span>
            {count > 1 ? <span className="dashboard-messenger__reaction-count">{count}</span> : null}
          </span>
        ))}
        {showAdd ? (
          <button
            type="button"
            className="dashboard-messenger__reaction-add"
            aria-label="Добавить реакцию"
            title="Добавить реакцию"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setReactionPick({
                targetId: m.id,
                anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
              })
            }}
          >
            <FiRrIcon name="add" />
          </button>
        ) : null}
      </div>
    )
  }

  const renderMessage = (m: DirectMessage, isComment = false) => {
    if (m.kind === 'reaction') return null
    return (
      <article key={m.id} className={`dashboard-messenger__message${isComment ? ' dashboard-messenger__message--reply' : ''}`}>
        <div className="dashboard-messenger__message-body">{renderMarkdownAndPreview(m)}</div>
        {renderReactionChips(m, 'dashboard-messenger__message-reactions')}
      </article>
    )
  }

  const renderChannelPostCard = (p: DirectMessage) => {
    if (p.kind === 'reaction') return null
    const n = commentCountByPostId[p.id] ?? 0
    const capped = commentCountHasMoreByPostId[p.id] ?? false
    const countLabel = capped ? `${n}+` : String(n)
    return (
      <article
        key={p.id}
        className="dashboard-messenger__channel-post"
        onContextMenu={(e) => {
          e.preventDefault()
          if (p.id.startsWith('local-')) return
          setReactionPick({
            targetId: p.id,
            anchor: { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY },
          })
        }}
      >
        <div className="dashboard-messenger__channel-post-inner">
          <button
            type="button"
            className="dashboard-messenger__channel-post-more"
            aria-label="Действия с постом"
            title="Действия"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setPostMenu((cur) => {
                if (cur?.post.id === p.id) return null
                return {
                  post: p,
                  anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
                }
              })
            }}
            disabled={p.id.startsWith('local-')}
          >
            <span className="dashboard-messenger__channel-post-more-icon" aria-hidden>
              ⋮
            </span>
          </button>
          {p.meta?.postDraft ? (
            <PostDraftReadView
              draft={p.meta.postDraft}
              urlByStoragePath={signedUrlByPath}
              publishedAt={p.createdAt}
              editedAt={p.editedAt}
            />
          ) : (
            <>
              <PostPublicationLine publishedAt={p.createdAt} editedAt={p.editedAt} />
              {renderMarkdownAndPreview(p, 'dashboard-messenger__channel-post-body')}
            </>
          )}
        </div>
        <div className="dashboard-messenger__channel-post-footer">
          {renderReactionChips(p, 'dashboard-messenger__channel-post-reactions', { showAddButton: false })}
          <button
            type="button"
            className="dashboard-messenger__channel-post-comments"
            aria-label={`Комментарии, ${countLabel}`}
            onClick={() => void openCommentsModal(p.id)}
          >
            <FiRrIcon name="comment" />
            <span className="dashboard-messenger__channel-post-comments-count">{countLabel}</span>
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
          <div className="dashboard-messenger__channel-feed">
            {posts
              .filter((m) => m.kind !== 'reaction')
              .map((p) => renderChannelPostCard(p))}
          </div>
        )}
      </div>

      <div className="dashboard-messenger__thread-footer">
        <button
          type="button"
          className="dashboard-topbar__action dashboard-topbar__action--primary"
          onClick={() => setPostEditor({ mode: 'create' })}
          disabled={threadLoading}
          style={{ width: '100%' }}
        >
          Добавить пост
        </button>
      </div>

      {postMenu
        ? createPortal(
            <div
              ref={postMenuWrapRef}
              className="messenger-msg-menu-wrap"
              style={{ position: 'fixed', left: 0, top: 0, zIndex: 26500, visibility: 'hidden' }}
            >
              <MessengerMessageMenuPopover
                canEdit={Boolean(
                  user?.id &&
                    postMenu.post.senderUserId === user.id &&
                    !postMenu.post.id.startsWith('local-') &&
                    (postMenu.post.kind === 'text' || postMenu.post.kind === 'image' || postMenu.post.kind === 'system'),
                )}
                canDelete={Boolean(
                  user?.id &&
                    postMenu.post.senderUserId === user.id &&
                    !postMenu.post.id.startsWith('local-') &&
                    (postMenu.post.kind === 'text' || postMenu.post.kind === 'image' || postMenu.post.kind === 'system'),
                )}
                onClose={() => setPostMenu(null)}
                onEdit={() => {
                  setPostEditor({ mode: 'edit', message: postMenu.post })
                  setPostMenu(null)
                }}
                onDelete={() => {
                  void runDeletePost(postMenu.post.id)
                  setPostMenu(null)
                }}
                onReply={() => {
                  void openCommentsModal(postMenu.post.id)
                  setPostMenu(null)
                }}
                onPickReaction={(em) => {
                  if (!postMenu.post.id || !isAllowedReactionEmoji(em)) return
                  void addReactionOnly(postMenu.post.id, em)
                  setPostMenu(null)
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {reactionPick
        ? createPortal(
            <div
              ref={reactionPickWrapRef}
              className="messenger-msg-menu-wrap messenger-channel-reaction-pick-wrap"
              style={{ position: 'fixed', left: 0, top: 0, zIndex: 26500, visibility: 'hidden' }}
            >
              <ReactionEmojiPopover
                title="Реакция"
                emojis={REACTION_EMOJI_WHITELIST}
                onClose={() => setReactionPick(null)}
                onPick={(em) => {
                  if (!reactionPick.targetId || !isAllowedReactionEmoji(em)) return
                  void addReactionOnly(reactionPick.targetId, em as ReactionEmoji)
                  setReactionPick(null)
                }}
              />
            </div>,
            document.body,
          )
        : null}

      {commentsModalPostId ? (
        <div className="confirm-dialog-root">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={() => setCommentsModalPostId(null)} />
          <div className="confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3 style={{ marginTop: 0 }}>Комментарии</h3>
            {commentsLoadingPostId === commentsModalPostId ? (
              <div className="auth-loading auth-loading--inline" aria-label="Загрузка..." />
            ) : null}
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              {(commentsByPostId[commentsModalPostId] ?? [])
                .filter((m) => m.kind !== 'reaction')
                .map((c) => renderMessage(c, true))}
              {(commentsByPostId[commentsModalPostId] ?? []).filter((m) => m.kind !== 'reaction').length === 0 ? (
                <div className="dashboard-chats-empty" style={{ padding: 8 }}>
                  Пока нет комментариев.
                </div>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <input
                className="dashboard-messenger__input"
                value={draftCommentByPostId[commentsModalPostId] ?? ''}
                placeholder="Комментарий…"
                onChange={(e) => setDraftCommentByPostId((prev) => ({ ...prev, [commentsModalPostId]: e.target.value }))}
              />
              <button
                type="button"
                className="dashboard-topbar__action dashboard-topbar__action--primary"
                disabled={sendingCommentPostId === commentsModalPostId || !(draftCommentByPostId[commentsModalPostId] ?? '').trim()}
                onClick={() => void sendComment(commentsModalPostId)}
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PostEditorModal
        open={postEditor !== null}
        mode={postEditor?.mode === 'edit' ? 'edit' : 'create'}
        editMessage={postEditor?.mode === 'edit' ? postEditor.message : null}
        conversationId={conversationId}
        onClose={() => setPostEditor(null)}
        onSaved={reloadPosts}
      />
    </div>
  )
}

