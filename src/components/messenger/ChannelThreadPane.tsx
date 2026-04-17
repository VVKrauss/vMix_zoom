import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../../utils/popoverOutsideClick'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { supabase } from '../../lib/supabase'
import { mapDirectMessageFromRow, type DirectMessage } from '../../lib/messenger'
import { getMessengerImageSignedUrl } from '../../lib/messenger'
import { buildQuotePreview } from '../../lib/messengerQuotePreview'
import {
  appendChannelComment,
  deleteChannelComment,
  deleteChannelPost,
  editChannelComment,
  isAllowedReactionEmoji,
  listChannelCommentsPage,
  listChannelCommentCounts,
  listChannelPostsPage,
  markChannelRead,
  toggleChannelMessageReaction,
} from '../../lib/channels'
import { collectStoragePathsFromDraft } from '../../lib/postEditor/draftUtils'
import type { ReactionEmoji } from '../../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../../types/roomComms'
import { ChevronLeftIcon, FiRrIcon, XCloseIcon } from '../icons'
import { MessengerMessageMenuPopover } from '../MessengerMessageMenuPopover'
import { PostDraftReadView, PostPublicationLine } from '../postEditor/PostDraftReadView'
import { PostEditorModal } from '../postEditor/PostEditorModal'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'
import { DoubleTapHeartSurface } from './DoubleTapHeartSurface'
import { ThreadMessageBubble } from './ThreadMessageBubble'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'

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

/** Realtime DELETE: `old.id` иногда приходит не как string. */
function chatMessageDeleteRowId(oldRow: Record<string, unknown>): string | null {
  const raw = oldRow.id
  if (typeof raw === 'string') {
    const t = raw.trim()
    return t || null
  }
  if (raw != null) {
    const t = String(raw).trim()
    return t || null
  }
  return null
}

function formatChannelBubbleTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const CHANNEL_STAFF_ROLES = new Set(['owner', 'admin', 'moderator'])
const QUICK_REACTION_EMOJI: ReactionEmoji = '❤️'

export function ChannelThreadPane({
  conversationId,
  onTouchTail,
  onForwardMessage,
  isMemberHint,
  postingMode,
  viewerOnly,
  publicJoinCta,
  joinRequestPending,
  jumpToMessageId,
  jumpToParentMessageId,
  onJumpHandled,
}: {
  conversationId: string
  onTouchTail?: (patch: { lastMessageAt: string; lastMessagePreview: string }) => void
  /** Переслать текст/фото в личный чат (открывает модалку на уровне страницы). */
  onForwardMessage?: (message: DirectMessage) => void
  /** Хинт из родителя: если диалог уже есть в списке, считаем что участник (убирает рассинхрон после вступления). */
  isMemberHint?: boolean
  postingMode?: 'admins_only' | 'everyone'
  viewerOnly?: boolean
  publicJoinCta?: { label: string; disabled: boolean; onClick: () => void } | null
  joinRequestPending?: boolean
  jumpToMessageId?: string | null
  /** Для комментариев канала: id поста-родителя. */
  jumpToParentMessageId?: string | null
  onJumpHandled?: () => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const isMobileMessenger = useMediaQuery('(max-width: 900px)')

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
  const [quoteToComment, setQuoteToComment] = useState<DirectMessage | null>(null)
  const [reactionPick, setReactionPick] = useState<{
    targetId: string
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [postMenu, setPostMenu] = useState<{
    post: DirectMessage
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [commentMenu, setCommentMenu] = useState<{
    message: DirectMessage
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [myChannelMemberRole, setMyChannelMemberRole] = useState<string | null>(null)
  const [commentDeleteBusy, setCommentDeleteBusy] = useState(false)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [draftEditComment, setDraftEditComment] = useState('')
  const [editCommentBusy, setEditCommentBusy] = useState(false)
  const postMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const commentMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const reactionPickWrapRef = useRef<HTMLDivElement | null>(null)
  const seenChannelCommentIdsRef = useRef<Set<string>>(new Set())
  const [signedUrlByPath, setSignedUrlByPath] = useState<Record<string, string>>({})
  const postAnchorRef = useRef<Map<string, HTMLElement>>(new Map())
  const commentAnchorRef = useRef<Map<string, HTMLElement>>(new Map())
  const commentsScrollRef = useRef<HTMLDivElement | null>(null)
  const commentsPinnedToBottomRef = useRef(true)

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  const isChannelMember = myChannelMemberRole !== null || isMemberHint === true
  const canView = viewerOnly || isChannelMember

  const removeReactionMessageEverywhere = useCallback((messageId: string) => {
    const id = messageId.trim()
    if (!id) return
    setReactions((prev) => prev.filter((r) => r.id !== id))
    setPosts((prev) => prev.filter((p) => p.id !== id))
    setCommentsByPostId((prev) => {
      let touched = false
      const next: Record<string, DirectMessage[]> = { ...prev }
      for (const key of Object.keys(next)) {
        const cur = next[key]!
        const filtered = cur.filter((c) => c.id !== id)
        if (filtered.length !== cur.length) {
          next[key] = filtered
          touched = true
        }
      }
      return touched ? next : prev
    })
  }, [])

  const canModerateChannel = Boolean(myChannelMemberRole && CHANNEL_STAFF_ROLES.has(myChannelMemberRole))
  const canCreatePosts = isChannelMember && (postingMode === 'everyone' || canModerateChannel)

  useEffect(() => {
    if (!error) return
    toast.push({ tone: 'error', message: error, ms: 3800 })
    setError(null)
  }, [error, toast])

  useEffect(() => {
    setQuoteToComment(null)
  }, [commentsModalPostId])

  const scrollToQuotedMessage = useCallback((quotedId: string) => {
    const el = commentAnchorRef.current.get(quotedId) ?? postAnchorRef.current.get(quotedId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('dashboard-messenger__message--highlight')
    window.setTimeout(() => {
      el.classList.remove('dashboard-messenger__message--highlight')
    }, 1400)
  }, [])

  useEffect(() => {
    let cancelled = false
    const cid = conversationId.trim()
    if (!user?.id || !cid) {
      setMyChannelMemberRole(null)
      return
    }
    void supabase
      .from('chat_conversation_members')
      .select('role')
      .eq('conversation_id', cid)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setMyChannelMemberRole(null)
          return
        }
        const r = typeof (data as { role?: unknown }).role === 'string' ? (data as { role: string }).role.trim() : null
        setMyChannelMemberRole(r)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, user?.id])

  const reloadPosts = useCallback(() => {
    const cid = conversationId.trim()
    if (!user?.id || !cid || !canView) return
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
  }, [conversationId, user?.id, onTouchTail, canView])

  useEffect(() => {
    let active = true
    const cid = conversationId.trim()
    if (!user?.id || !cid || !canView) return
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
      const nextPosts = (res.data ?? []).filter((m) => m.kind !== 'reaction')
      setPosts(res.data ?? [])
      setHasMoreOlder(res.hasMoreOlder)
      void markChannelRead(cid)

      // Fill comment counts immediately for visible posts
      const postIds = nextPosts.map((p) => p.id).filter(Boolean)
      void listChannelCommentCounts(cid, postIds).then((cc) => {
        if (!active) return
        if (cc.error || !cc.data) return
        setCommentCountByPostId((prev) => ({ ...prev, ...cc.data! }))
        setCommentCountHasMoreByPostId((prev) => {
          const patch: Record<string, boolean> = {}
          for (const id of Object.keys(cc.data!)) patch[id] = false
          return { ...prev, ...patch }
        })
      })
    })
    return () => {
      active = false
    }
  }, [conversationId, user?.id, canView])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !user?.id || !canView) return
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
          if (commentsPinnedToBottomRef.current && commentsModalPostId?.trim() === postId.trim()) {
            requestAnimationFrame(() => {
              const el = commentsScrollRef.current
              if (el) el.scrollTop = el.scrollHeight
            })
          }
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const oldRow = payload.old as Record<string, unknown>
        const id = chatMessageDeleteRowId(oldRow)
        if (!id || cidRef.current.trim() !== cid) return
        const kind = typeof oldRow.kind === 'string' ? oldRow.kind : ''
        const replyToRaw = oldRow.reply_to_message_id
        const replyTo = typeof replyToRaw === 'string' && replyToRaw.trim() ? replyToRaw.trim() : null

        if (kind === 'reaction') {
          removeReactionMessageEverywhere(id)
          return
        }

        if (replyTo) {
          setCommentsByPostId((prev) => {
            const cur = prev[replyTo]
            if (!cur?.some((c) => c.id === id)) return prev
            setCommentCountByPostId((pc) => ({
              ...pc,
              [replyTo]: Math.max(0, (pc[replyTo] ?? 0) - 1),
            }))
            return { ...prev, [replyTo]: cur.filter((c) => c.id !== id) }
          })
          return
        }

        setPosts((prev) => prev.filter((p) => p.id !== id))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user?.id, onTouchTail, removeReactionMessageEverywhere])

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

  /** Реакции: одна строка — один id (не дублировать между posts / comments / realtime). */
  const allMessagesForReactions = useMemo(() => {
    const byId = new Map<string, DirectMessage>()
    const take = (x: DirectMessage) => {
      if (x.kind !== 'reaction' || !x.id) return
      byId.set(x.id, x)
    }
    for (const p of posts) take(p)
    for (const arr of Object.values(commentsByPostId)) {
      for (const c of arr) take(c)
    }
    for (const r of reactions) take(r)
    return [...byId.values()].sort(sortChrono)
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
    if (viewerOnly) return
    const cid = conversationId.trim()
    if (!cid || !postId) return
    setCommentsModalPostId(postId)
    commentsPinnedToBottomRef.current = true

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
      requestAnimationFrame(() => {
        const el = commentsScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    } finally {
      setCommentsLoadingPostId(null)
    }
  }, [conversationId, viewerOnly])

  const updateCommentsPinned = useCallback(() => {
    const el = commentsScrollRef.current
    if (!el) return
    const slack = 48
    commentsPinnedToBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - slack
  }, [])

  useEffect(() => {
    if (!commentsModalPostId) return
    commentsPinnedToBottomRef.current = true
    requestAnimationFrame(() => {
      const el = commentsScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [commentsModalPostId])

  useEffect(() => {
    const mid = jumpToMessageId?.trim() ?? ''
    if (!mid) return
    const pid = jumpToParentMessageId?.trim() ?? ''
    if (pid) {
      if (commentsModalPostId?.trim() !== pid) {
        void openCommentsModal(pid)
        return
      }
      const el = commentAnchorRef.current.get(mid)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('dashboard-messenger__message--highlight')
      window.setTimeout(() => {
        el.classList.remove('dashboard-messenger__message--highlight')
      }, 1400)
      onJumpHandled?.()
      return
    }
    const el = postAnchorRef.current.get(mid)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('dashboard-messenger__message--highlight')
    window.setTimeout(() => {
      el.classList.remove('dashboard-messenger__message--highlight')
    }, 1400)
    onJumpHandled?.()
  }, [
    commentsByPostId,
    commentsModalPostId,
    jumpToMessageId,
    jumpToParentMessageId,
    onJumpHandled,
    openCommentsModal,
    posts.length,
  ])

  const sendComment = useCallback(async (postId: string) => {
    const cid = conversationId.trim()
    const body = (draftCommentByPostId[postId] ?? '').trim()
    if (!isChannelMember || !user?.id || !cid || !postId || !body || sendingCommentPostId) return
    setSendingCommentPostId(postId)
    const quoteId =
      quoteToComment?.id && quoteToComment.replyToMessageId?.trim() === postId.trim()
        ? quoteToComment.id
        : null
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: 'Вы',
      kind: 'text',
      body,
      createdAt: new Date().toISOString(),
      replyToMessageId: postId,
      quoteToMessageId: quoteId,
    }
    setCommentsByPostId((prev) => {
      const cur = prev[postId] ?? []
      return { ...prev, [postId]: [...cur, optimistic].sort(sortChrono) }
    })
    setCommentCountByPostId((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }))
    setDraftCommentByPostId((prev) => ({ ...prev, [postId]: '' }))
    try {
      const res = await appendChannelComment(cid, postId, body, { quoteToMessageId: quoteId })
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
      setQuoteToComment(null)
    } finally {
      setSendingCommentPostId(null)
    }
  }, [conversationId, draftCommentByPostId, sendingCommentPostId, user?.id, quoteToComment, isChannelMember])

  const toggleReaction = useCallback(
    async (targetMessageId: string, emoji: ReactionEmoji) => {
      const cid = conversationId.trim()
      const uid = user?.id
      if (!isChannelMember || !cid || !uid || !isAllowedReactionEmoji(emoji)) return
      const opKey = `${cid}::${targetMessageId}::${emoji}`
      if (reactionOpInFlightRef.current.has(opKey)) return
      reactionOpInFlightRef.current.add(opKey)
      try {
        const res = await toggleChannelMessageReaction(cid, targetMessageId, emoji)
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 2600 })
          return
        }
        const payload = res.data
        if (!payload) return

        if (payload.action === 'removed') {
          removeReactionMessageEverywhere(payload.messageId)
          return
        }

        const target = targetMessageId.trim()
        const um = user.user_metadata ?? {}
        const snap =
          (typeof um.display_name === 'string' && um.display_name.trim()) ||
          (typeof um.full_name === 'string' && um.full_name.trim()) ||
          (typeof um.name === 'string' && um.name.trim()) ||
          (user.email?.split('@')[0] ?? 'Вы')
        const createdAt = payload.createdAt ?? new Date().toISOString()
        const newRow: DirectMessage = {
          id: payload.messageId,
          senderUserId: uid,
          senderNameSnapshot: snap.slice(0, 200),
          kind: 'reaction',
          body: emoji,
          createdAt,
          meta: { react_to: target },
        }
        setReactions((prev) => (prev.some((r) => r.id === newRow.id) ? prev : [...prev, newRow].sort(sortChrono)))
      } finally {
        reactionOpInFlightRef.current.delete(opKey)
      }
    },
    [conversationId, toast, user, removeReactionMessageEverywhere, isChannelMember],
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

  const runDeleteComment = useCallback(
    async (comment: DirectMessage) => {
      const cid = conversationId.trim()
      const postId = comment.replyToMessageId?.trim() ?? ''
      if (!user?.id || !cid || !comment.id || commentDeleteBusy || !postId) return
      if (!window.confirm('Удалить этот комментарий?')) return
      setCommentDeleteBusy(true)
      setError(null)
      try {
        const res = await deleteChannelComment(cid, comment.id)
        if (res.error) {
          setError(res.error)
          return
        }
        setCommentMenu(null)
        setCommentsByPostId((prev) => {
          const cur = prev[postId]
          if (!cur?.some((c) => c.id === comment.id)) return prev
          setCommentCountByPostId((pc) => ({
            ...pc,
            [postId]: Math.max(0, (pc[postId] ?? 0) - 1),
          }))
          return { ...prev, [postId]: cur.filter((c) => c.id !== comment.id) }
        })
        if (editingCommentId === comment.id) {
          setEditingCommentId(null)
          setDraftEditComment('')
        }
      } finally {
        setCommentDeleteBusy(false)
      }
    },
    [commentDeleteBusy, conversationId, editingCommentId, user?.id],
  )

  const runSaveEditComment = useCallback(async () => {
    const cid = conversationId.trim()
    const id = editingCommentId?.trim() ?? ''
    const body = draftEditComment.trim()
    if (!user?.id || !cid || !id || !body || editCommentBusy) return
    setEditCommentBusy(true)
    setError(null)
    try {
      const res = await editChannelComment(cid, id, body)
      if (res.error) {
        setError(res.error)
        return
      }
      setEditingCommentId(null)
      setDraftEditComment('')
    } finally {
      setEditCommentBusy(false)
    }
  }, [conversationId, draftEditComment, editCommentBusy, editingCommentId, user?.id])

  useEffect(() => {
    if (!commentsModalPostId) {
      setCommentMenu(null)
      setEditingCommentId(null)
      setDraftEditComment('')
    }
  }, [commentsModalPostId])

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
    const el = commentMenuWrapRef.current
    if (!el || !commentMenu) return
    const { anchor } = commentMenu
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
  }, [commentMenu])

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
    if (!commentMenu) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0] ? (e.touches[0]!.target as EventTarget) : (e as MouseEvent).target
      if (shouldClosePopoverOnOutsidePointer(commentMenuWrapRef.current, target)) setCommentMenu(null)
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [commentMenu])

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

  useEffect(() => {
    if (!commentMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCommentMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commentMenu])

  const renderMarkdownAndPreview = (m: DirectMessage, bodyClassName?: string) => {
    if (m.kind === 'reaction') return null
    const link = m.meta?.link?.url?.trim() ? m.meta.link : null
    const md = (
      <>
        <div className="messenger-message-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ href, children, ...props }) => {
                const raw = (href ?? '').trim()
                const to = (() => {
                  if (!raw) return null
                  try {
                    const origin = typeof window !== 'undefined' ? window.location.origin : ''
                    const base = origin || 'http://localhost'
                    const abs = /^https?:\/\//i.test(raw) ? new URL(raw) : raw.startsWith('/') ? new URL(raw, base) : null
                    if (!abs) return null
                    if (origin && abs.origin !== origin) return null
                    const path = abs.pathname || '/'
                    if (!path.startsWith('/dashboard/') && !path.startsWith('/r/')) return null
                    return `${path}${abs.search || ''}${abs.hash || ''}`
                  } catch {
                    return null
                  }
                })()
                if (to) {
                  // @ts-expect-error react-markdown passes anchor props, but Link doesn't accept all of them
                  return (
                    <Link to={to} className="messenger-message-link">
                      {children}
                    </Link>
                  )
                }
                return (
                  <a {...props} href={href} className="messenger-message-link" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                )
              },
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
    if (viewerOnly) return null
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

  const canEditOrDeleteComment = (m: DirectMessage) =>
    Boolean(
      user?.id &&
        !m.id.startsWith('local-') &&
        (m.kind === 'text' || m.kind === 'image') &&
        (m.senderUserId === user.id || canModerateChannel),
    )

  const renderChannelComment = (m: DirectMessage) => {
    if (m.kind === 'reaction') return null
    const isOwn = Boolean(user?.id && m.senderUserId === user.id)
    const isEditing = editingCommentId === m.id

    if (isEditing) {
      return (
        <article
          key={m.id}
          className={`dashboard-messenger__message dashboard-messenger__message--reply${
            isOwn ? ' dashboard-messenger__message--own' : ''
          }`}
          ref={(el) => {
            if (el) commentAnchorRef.current.set(m.id, el)
            else commentAnchorRef.current.delete(m.id)
          }}
        >
          <div className="dashboard-messenger__message-meta">
            <div className="dashboard-messenger__message-meta-main">
              <span className="dashboard-messenger__message-author">{m.senderNameSnapshot}</span>
              <time dateTime={m.createdAt}>{formatChannelBubbleTime(m.createdAt)}</time>
              {m.editedAt ? <span className="dashboard-messenger__edited">изм.</span> : null}
            </div>
          </div>
          <div className="dashboard-messenger__message-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              className="dashboard-messenger__input"
              rows={3}
              value={draftEditComment}
              onChange={(e) => setDraftEditComment(e.target.value)}
              disabled={editCommentBusy}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="dashboard-topbar__action"
                disabled={editCommentBusy}
                onClick={() => {
                  setEditingCommentId(null)
                  setDraftEditComment('')
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="dashboard-topbar__action dashboard-topbar__action--primary"
                disabled={editCommentBusy || !draftEditComment.trim()}
                onClick={() => void runSaveEditComment()}
              >
                {editCommentBusy ? '…' : 'Сохранить'}
              </button>
            </div>
          </div>
        </article>
      )
    }

    const reacts = reactionsByTargetId.get(m.id) ?? []
    const pid = m.replyToMessageId?.trim() ?? ''

    const { preview: replyPreview, scrollTargetId: replyScrollTargetId } = buildQuotePreview({
      quotedMessageId: m.quoteToMessageId?.trim() || null,
      messageById: (id) => {
        const cur = pid ? (commentsByPostId[pid] ?? []) : []
        return cur.find((x) => x.id === id) ?? posts.find((p) => p.id === id)
      },
      resolveQuotedAvatarUrl: () => null,
    })

    return (
      <ThreadMessageBubble
        key={m.id}
        message={m}
        isOwn={isOwn}
        reactions={reacts}
        formatDt={formatChannelBubbleTime}
        replyPreview={replyPreview}
        replyScrollTargetId={replyScrollTargetId}
        onReplyQuoteNavigate={scrollToQuotedMessage}
        bindMessageAnchor={(id, el) => {
          if (el) commentAnchorRef.current.set(id, el)
          else commentAnchorRef.current.delete(id)
        }}
        currentUserId={user?.id ?? null}
        onReactionChipTap={onReactionChipTap}
        quickReactEnabled={Boolean(
          isChannelMember &&
            user?.id &&
            !m.id.startsWith('local-') &&
            (m.kind === 'text' || m.kind === 'image'),
        )}
        isMobileMessenger={isMobileMessenger}
        onQuickHeart={() => void toggleReaction(m.id, QUICK_REACTION_EMOJI)}
        swipeReplyEnabled={isMobileMessenger && isChannelMember}
        onSwipeReply={() => setQuoteToComment(m)}
        menuOpen={commentMenu?.message.id === m.id}
        onMenuButtonClick={(e) => {
          e.stopPropagation()
          if (!isChannelMember || m.id.startsWith('local-')) return
          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
          setCommentMenu((cur) => {
            if (cur?.message.id === m.id) return null
            return { message: m, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
          })
        }}
        onBubbleContextMenu={(e) => {
          e.preventDefault()
          if (!isChannelMember || m.id.startsWith('local-')) return
          setCommentMenu((cur) => {
            if (cur?.message.id === m.id) return null
            return { message: m, anchor: { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY } }
          })
        }}
        renderBody={(msg) => renderMarkdownAndPreview(msg)}
      />
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
        ref={(el) => {
          if (el) postAnchorRef.current.set(p.id, el)
          else postAnchorRef.current.delete(p.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          if (!isChannelMember) return
          if (p.id.startsWith('local-')) return
          setReactionPick({
            targetId: p.id,
            anchor: { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY },
          })
        }}
      >
        <DoubleTapHeartSurface
          enabled={Boolean(isChannelMember && user?.id && !p.id.startsWith('local-'))}
          isMobileViewport={isMobileMessenger}
          onHeart={() => void toggleReaction(p.id, QUICK_REACTION_EMOJI)}
        >
        <div className="dashboard-messenger__channel-post-inner">
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
        </DoubleTapHeartSurface>
        <div className="dashboard-messenger__channel-post-footer">
          {renderReactionChips(p, 'dashboard-messenger__channel-post-reactions', { showAddButton: false })}
          {!viewerOnly ? (
            <div className="dashboard-messenger__channel-post-footer-actions">
              <button
                type="button"
                className="dashboard-messenger__channel-post-comments"
                aria-label={`Комментарии, ${countLabel}`}
                onClick={() => void openCommentsModal(p.id)}
              >
                <FiRrIcon name="comment" />
                <span className="dashboard-messenger__channel-post-comments-count">{countLabel}</span>
              </button>
              <button
                type="button"
                className="dashboard-messenger__channel-post-more dashboard-messenger__channel-post-more--footer"
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
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  const selectedCommentsPost = useMemo(
    () => (commentsModalPostId ? posts.find((p) => p.id === commentsModalPostId) ?? null : null),
    [commentsModalPostId, posts],
  )

  const selectedPostTitle = useMemo(() => {
    const p = selectedCommentsPost
    if (!p) return 'Пост'
    const raw = (p.body ?? '').replace(/\s+/g, ' ').trim()
    if (!raw) return 'Пост'
    const cut = raw.length > 72 ? `${raw.slice(0, 72).trim()}…` : raw
    return cut || 'Пост'
  }, [selectedCommentsPost])

  const selectedPostMeta = useMemo(() => {
    const p = selectedCommentsPost
    if (!p) return ''
    const dt = formatChannelBubbleTime(p.createdAt)
    const edited = p.editedAt ? ' · изм.' : ''
    const n = commentCountByPostId[p.id] ?? 0
    const capped = commentCountHasMoreByPostId[p.id] ?? false
    const count = capped ? `${n}+` : String(n)
    return `${dt}${edited} · ${count} комм.`
  }, [commentCountByPostId, commentCountHasMoreByPostId, selectedCommentsPost])

  const renderChannelPostsView = () => (
    <>
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
        ) : !canView ? (
          joinRequestPending ? (
            <div className="messenger-join-gate messenger-join-gate--embed">
              <div className="messenger-join-gate__card messenger-join-gate__card--compact">
                <h2 className="messenger-join-gate__title messenger-join-gate__title--sm">Заявка отправлена</h2>
                <p className="messenger-join-gate__text">
                  Ожидайте подтверждения от администратора — после одобрения посты появятся здесь.
                </p>
              </div>
            </div>
          ) : (
            <div className="messenger-join-gate messenger-join-gate--embed">
              <div className="messenger-join-gate__card messenger-join-gate__card--compact">
                <h2 className="messenger-join-gate__title messenger-join-gate__title--sm">Нет доступа</h2>
                <p className="messenger-join-gate__text">Канал закрыт или у вас нет доступа к содержимому.</p>
              </div>
            </div>
          )
        ) : posts.filter((m) => m.kind !== 'reaction').length === 0 ? (
          viewerOnly && publicJoinCta ? (
            <div className="messenger-viewer-join-empty messenger-viewer-join-empty--channel">
              <button
                type="button"
                className="messenger-join-gate__cta messenger-join-gate__cta--inline"
                onClick={publicJoinCta.onClick}
                disabled={publicJoinCta.disabled}
              >
                {publicJoinCta.disabled ? '…' : publicJoinCta.label}
              </button>
            </div>
          ) : (
            <div className="dashboard-chats-empty">Пока нет постов.</div>
          )
        ) : (
          <>
            <div className="dashboard-messenger__channel-feed">
              {posts
                .filter((m) => m.kind !== 'reaction')
                .map((p) => renderChannelPostCard(p))}
            </div>
            {viewerOnly && publicJoinCta ? (
              <div className="messenger-viewer-join-after">
                <button
                  type="button"
                  className="messenger-join-gate__cta messenger-join-gate__cta--inline"
                  onClick={publicJoinCta.onClick}
                  disabled={publicJoinCta.disabled}
                >
                  {publicJoinCta.disabled ? '…' : publicJoinCta.label}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="dashboard-messenger__thread-footer">
        {canCreatePosts ? (
          <button
            type="button"
            className="dashboard-topbar__action dashboard-topbar__action--primary"
            onClick={() => setPostEditor({ mode: 'create' })}
            disabled={threadLoading}
            style={{ width: '100%' }}
          >
            Добавить пост
          </button>
        ) : null}
      </div>
    </>
  )

  const renderChannelCommentsView = () => {
    if (!commentsModalPostId) return null
    const list = (commentsByPostId[commentsModalPostId] ?? []).filter((m) => m.kind !== 'reaction')
    const draft = draftCommentByPostId[commentsModalPostId] ?? ''
    const sending = sendingCommentPostId === commentsModalPostId
    const canSend = Boolean(draft.trim()) && !sending
    const isDesktopSplit = !isMobileMessenger

    const postsCompact = (
      <div className="dashboard-messenger__channel-comments-posts" role="region" aria-label="Посты канала">
        <div className="dashboard-messenger__channel-comments-posts-scroll">
          {posts
            .filter((m) => m.kind !== 'reaction')
            .map((p) => {
              const n = commentCountByPostId[p.id] ?? 0
              const capped = commentCountHasMoreByPostId[p.id] ?? false
              const label = capped ? `${n}+` : String(n)
              const raw = (p.body ?? '').replace(/\s+/g, ' ').trim()
              const title = raw ? (raw.length > 64 ? `${raw.slice(0, 64).trim()}…` : raw) : 'Пост'
              const active = p.id === commentsModalPostId
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`dashboard-messenger__channel-comments-post-row${active ? ' dashboard-messenger__channel-comments-post-row--active' : ''}`}
                  onClick={() => void openCommentsModal(p.id)}
                  title={title}
                >
                  <span className="dashboard-messenger__channel-comments-post-row__title">{title}</span>
                  <span className="dashboard-messenger__channel-comments-post-row__count">{label}</span>
                </button>
              )
            })}
        </div>
        {canCreatePosts ? (
          <div className="dashboard-messenger__channel-comments-posts-footer">
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
        ) : null}
      </div>
    )

    const commentsPane = (
      <div className="dashboard-messenger__channel-comments-thread" role="region" aria-label="Комментарии к посту">
        {isMobileMessenger ? (
          <header className="dashboard-messenger__list-head dashboard-messenger__list-head--thread">
            <div className="dashboard-messenger__thread-head-back-wrap">
              <button
                type="button"
                className="dashboard-messenger__list-head-btn"
                aria-label="К постам"
                title="К постам"
                onClick={() => setCommentsModalPostId(null)}
              >
                <ChevronLeftIcon />
              </button>
            </div>
            <div className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--thread-block">
              <div className="dashboard-messenger__thread-head-center-meta">{selectedPostMeta || 'Комментарии'}</div>
              <div className="dashboard-messenger__thread-head-center-title">{selectedPostTitle}</div>
            </div>
            <div className="dashboard-messenger__list-head-actions" aria-hidden="true" />
          </header>
        ) : (
          <div className="dashboard-messenger__channel-comments-thread-head">
            <button
              type="button"
              className="dashboard-messenger__channel-comments-thread-back"
              aria-label="К постам"
              title="К постам"
              onClick={() => setCommentsModalPostId(null)}
            >
              <ChevronLeftIcon />
            </button>
            <div className="dashboard-messenger__channel-comments-thread-head-main">
              <div className="dashboard-messenger__channel-comments-thread-title">Комментарии</div>
              <div className="dashboard-messenger__channel-comments-thread-subtitle">
                {selectedPostTitle}{selectedPostMeta ? ` · ${selectedPostMeta}` : ''}
              </div>
            </div>
            <button
              type="button"
              className="dashboard-messenger__channel-comments-thread-close"
              aria-label="Закрыть комментарии"
              title="Закрыть"
              onClick={() => setCommentsModalPostId(null)}
            >
              <XCloseIcon />
            </button>
          </div>
        )}

        <div
          ref={commentsScrollRef}
          className="dashboard-messenger__messages-scroll"
          style={{ flex: '1 1 auto' }}
          onScroll={updateCommentsPinned}
        >
          <div className="dashboard-messenger__messages dashboard-messenger__messages--channel-comments-modal">
            {list.map((c) => renderChannelComment(c))}
            {list.length === 0 ? <div className="dashboard-chats-empty" style={{ padding: 8 }}>Пока нет комментариев.</div> : null}
          </div>
        </div>

        {isChannelMember ? (
          <div className="dashboard-messenger__composer" role="region" aria-label="Новый комментарий">
            {quoteToComment && quoteToComment.replyToMessageId?.trim() === commentsModalPostId ? (
              <div className="dashboard-messenger__composer-reply">
                <div className="dashboard-messenger__composer-reply-text">
                  <span className="dashboard-messenger__composer-reply-label">Ответ</span>{' '}
                  <strong>{quoteToComment.senderNameSnapshot}</strong>
                  <span className="dashboard-messenger__composer-reply-snippet">
                    <span>{quoteToComment.body?.trim() ? quoteToComment.body : '…'}</span>
                  </span>
                </div>
                <button
                  type="button"
                  className="dashboard-messenger__composer-reply-cancel"
                  aria-label="Отменить ответ"
                  onClick={() => setQuoteToComment(null)}
                >
                  ✕
                </button>
              </div>
            ) : null}
            <div className="dashboard-messenger__composer-main">
              <textarea
                className="dashboard-messenger__input"
                rows={isMobileMessenger ? 1 : 2}
                value={draft}
                placeholder="Комментарий…"
                onChange={(e) => setDraftCommentByPostId((prev) => ({ ...prev, [commentsModalPostId]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void sendComment(commentsModalPostId)
                  }
                }}
              />
              <div className="dashboard-messenger__composer-side">
                <button
                  type="button"
                  className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn"
                  disabled={!canSend}
                  onClick={() => void sendComment(commentsModalPostId)}
                >
                  {sending ? '…' : 'Отправить'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )

    return isDesktopSplit ? (
      <div className="dashboard-messenger__channel-comments-layout">
        {postsCompact}
        {commentsPane}
      </div>
    ) : (
      commentsPane
    )
  }

  return (
    <div className="dashboard-messenger__thread-body">
      {commentsModalPostId ? renderChannelCommentsView() : renderChannelPostsView()}

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
                  void toggleReaction(postMenu.post.id, em)
                  setPostMenu(null)
                }}
                onForward={
                  onForwardMessage &&
                  !postMenu.post.id.startsWith('local-') &&
                  (postMenu.post.kind === 'text' || postMenu.post.kind === 'image')
                    ? () => {
                        onForwardMessage(postMenu.post)
                        setPostMenu(null)
                      }
                    : undefined
                }
              />
            </div>,
            document.body,
          )
        : null}

      {commentMenu
        ? createPortal(
            <div
              ref={commentMenuWrapRef}
              className="messenger-msg-menu-wrap"
              style={{ position: 'fixed', left: 0, top: 0, zIndex: 26500, visibility: 'hidden' }}
            >
              <MessengerMessageMenuPopover
                canEdit={canEditOrDeleteComment(commentMenu.message)}
                canDelete={canEditOrDeleteComment(commentMenu.message)}
                onClose={() => setCommentMenu(null)}
                onEdit={() => {
                  setEditingCommentId(commentMenu.message.id)
                  setDraftEditComment(commentMenu.message.body ?? '')
                  setCommentMenu(null)
                }}
                onDelete={() => {
                  void runDeleteComment(commentMenu.message)
                }}
                onReply={() => {
                  setQuoteToComment(commentMenu.message)
                  setCommentMenu(null)
                }}
                onPickReaction={(em) => {
                  if (!commentMenu.message.id || !isAllowedReactionEmoji(em)) return
                  void toggleReaction(commentMenu.message.id, em)
                  setCommentMenu(null)
                }}
                onForward={
                  onForwardMessage &&
                  !commentMenu.message.id.startsWith('local-') &&
                  (commentMenu.message.kind === 'text' || commentMenu.message.kind === 'image')
                    ? () => {
                        onForwardMessage(commentMenu.message)
                        setCommentMenu(null)
                      }
                    : undefined
                }
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
                  void toggleReaction(reactionPick.targetId, em as ReactionEmoji)
                  setReactionPick(null)
                }}
              />
            </div>,
            document.body,
          )
        : null}

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

