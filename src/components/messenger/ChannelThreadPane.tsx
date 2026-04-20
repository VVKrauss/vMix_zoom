import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { messengerBodyForMarkdown } from '../../lib/messengerMarkdownBody'
import { shouldClosePopoverOnOutsidePointer } from '../../utils/popoverOutsideClick'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { supabase } from '../../lib/supabase'
import {
  mapDirectMessageFromRow,
  messengerConversationListTailPatch,
  messengerStoragePathToThumbPath,
  previewTextForDirectMessageTail,
  requestMessengerUnreadRefresh,
  uploadMessengerAudio,
  uploadMessengerImage,
  type DirectMessage,
} from '../../lib/messenger'
import { buildQuotePreview } from '../../lib/messengerQuotePreview'
import {
  appendChannelComment,
  appendChannelFeedMessage,
  deleteChannelComment,
  deleteChannelPost,
  editChannelComment,
  isAllowedReactionEmoji,
  listChannelCommentsPage,
  listChannelCommentCounts,
  listChannelPostsPage,
  listChannelReactionsForTargets,
  toggleChannelMessageReaction,
} from '../../lib/channels'
import { useProfile } from '../../hooks/useProfile'
import { useLinkPreviewFromText } from '../../hooks/useLinkPreviewFromText'
import { buildLinkMetaForMessageBody, ensureLinkPreviewForBody } from '../../lib/linkPreview'
import { MESSENGER_COMPOSER_EMOJIS } from '../../lib/messengerComposerEmojis'
import {
  buildMessengerUrl,
  copyTextToClipboard,
  extractClipboardImageFiles,
  MESSENGER_GALLERY_MAX_ATTACH,
  MESSENGER_PHOTO_INPUT_MAX_BYTES,
} from '../../lib/messengerDashboardUtils'
import { collectStoragePathsFromDraft } from '../../lib/postEditor/draftUtils'
import type { ReactionEmoji } from '../../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../../types/roomComms'
import { AttachmentIcon, ChevronLeftIcon, FiRrIcon, MessengerSendPlaneIcon, XCloseIcon } from '../icons'
import { MessengerBubbleBody } from '../MessengerBubbleBody'
import { MessengerMessageMenuPopover } from '../MessengerMessageMenuPopover'
import { PostDraftReadView, PostPublicationLine } from '../postEditor/PostDraftReadView'
import { PostEditorModal } from '../postEditor/PostEditorModal'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'
import { DoubleTapHeartSurface } from './DoubleTapHeartSurface'
import { MessengerLinkPreviewCard } from './MessengerLinkPreviewCard'
import { ThreadMessageBubble } from './ThreadMessageBubble'
import { MessengerVoiceRecordBtn } from './MessengerVoiceRecordBtn'
import { injectMentionsInReactTree } from '../MessengerMessageBody'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { useMessengerJumpToBottom } from '../../hooks/useMessengerJumpToBottom'
import { useMessengerPerConversationDraft } from '../../hooks/useMessengerPerConversationDraft'
import { useMessengerThreadReadCoordinator } from '../../hooks/useMessengerThreadReadCoordinator'
import { attachMessengerTailCatchupAfterContentPaint } from '../../hooks/messengerTailCatchup'
import { MessengerJumpToBottomFab } from '../MessengerJumpToBottomFab'
import { DraftLinkPreviewBar } from './DraftLinkPreviewBar'
import { MessengerImageLightbox } from './MessengerImageLightbox'
import { loadCachedChannelFeed, saveCachedChannelFeed } from '../../lib/channelFeedCache'
import { resolveMediaUrlsForStoragePaths } from '../../lib/mediaCache'

function extractStoragePathsFromMarkdown(md: string): string[] {
  const out: string[] = []
  const re = /\bms:\/\/([^\s)]+)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md))) {
    const p = (m[1] ?? '').trim()
    if (p) {
      out.push(p)
      const thumb = messengerStoragePathToThumbPath(p)
      if (thumb) out.push(thumb)
    }
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
  messengerOnline = true,
  onTouchTail,
  onForwardMessage,
  onMentionSlug,
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
  messengerOnline?: boolean
  onTouchTail?: (patch: { lastMessageAt: string; lastMessagePreview: string }) => void
  /** Переслать текст/фото в личный чат (открывает модалку на уровне страницы). */
  onForwardMessage?: (message: DirectMessage) => void
  /** Клик по @slug в теле поста/комментария (markdown). */
  onMentionSlug?: (slug: string) => void
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
  const { profile } = useProfile()
  const toast = useToast()
  const isMobileMessenger = useMediaQuery('(max-width: 900px)')

  const [error, setError] = useState<string | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false)
  const [posts, setPosts] = useState<DirectMessage[]>([])
  /** Для scroll-to-tail после paint: не тащим весь `posts` в deps layout-эффекта. */
  const postsForFeedScrollRef = useRef(posts)
  postsForFeedScrollRef.current = posts
  /** Скролл к хвосту после загрузки: не завязан на edge threadLoading (батч true→false за один кадр). */
  const pendingChannelTailScrollRef = useRef(false)
  const channelFeedEndRef = useRef<HTMLDivElement | null>(null)
  const [reactions, setReactions] = useState<DirectMessage[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [postEditor, setPostEditor] = useState<null | { mode: 'create' } | { mode: 'edit'; message: DirectMessage }>(null)
  const { draft: feedDraft, setDraft: setFeedDraft, resetDraft: resetFeedDraft } =
    useMessengerPerConversationDraft(conversationId)
  const [feedSending, setFeedSending] = useState(false)
  const [feedPhotoUploading, setFeedPhotoUploading] = useState(false)
  const [feedVoiceUploading, setFeedVoiceUploading] = useState(false)
  const [feedVoiceRecording, setFeedVoiceRecording] = useState(false)
  const [feedVoiceMetaEl, setFeedVoiceMetaEl] = useState<HTMLDivElement | null>(null)
  const [pendingChannelPhotos, setPendingChannelPhotos] = useState<{ id: string; file: File; previewUrl: string }[]>([])
  const {
    preview: feedLinkPreview,
    loading: feedLinkPreviewLoading,
    dismiss: dismissFeedLinkPreview,
  } = useLinkPreviewFromText(feedDraft, { enabled: pendingChannelPhotos.length === 0 })
  const feedComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const feedPhotoInputRef = useRef<HTMLInputElement | null>(null)
  const feedComposerEmojiWrapRef = useRef<HTMLDivElement | null>(null)
  const [feedComposerEmojiOpen, setFeedComposerEmojiOpen] = useState(false)
  const [channelFeedLightbox, setChannelFeedLightbox] = useState<{ urls: string[]; index: number } | null>(null)
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
  const signedUrlByPathRef = useRef(signedUrlByPath)
  signedUrlByPathRef.current = signedUrlByPath
  const postAnchorRef = useRef<Map<string, HTMLElement>>(new Map())
  const commentAnchorRef = useRef<Map<string, HTMLElement>>(new Map())
  const commentsScrollRef = useRef<HTMLDivElement | null>(null)
  const postsFeedScrollRef = useRef<HTMLDivElement | null>(null)
  const postsFeedContentRef = useRef<HTMLDivElement | null>(null)
  const cancelPostsFeedTailCatchupRef = useRef<(() => void) | null>(null)
  const feedPinnedToBottomRef = useRef(true)
  const commentsPinnedToBottomRef = useRef(true)

  const postsJumpScopeKey = `${conversationId}:${commentsModalPostId ?? ''}`
  const { showJump: showPostsJump, jumpToBottom: jumpPostsBottom } = useMessengerJumpToBottom(
    postsFeedScrollRef,
    postsJumpScopeKey,
    posts.length,
  )
  const commentsJumpScopeKey = `${conversationId}:cmod:${commentsModalPostId ?? ''}`
  const commentsLen = commentsModalPostId ? (commentsByPostId[commentsModalPostId] ?? []).length : 0
  const { showJump: showCommentsJump, jumpToBottom: jumpCommentsBottom } = useMessengerJumpToBottom(
    commentsScrollRef,
    commentsJumpScopeKey,
    commentsLen,
  )

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  const updateFeedPinnedToBottom = useCallback(() => {
    const el = postsFeedScrollRef.current
    if (!el) return
    const slack = 48
    feedPinnedToBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - slack
  }, [])

  const isChannelMember = myChannelMemberRole !== null || isMemberHint === true
  const canView = viewerOnly || isChannelMember

  const channelLastSignificantPostId = useMemo(() => {
    const sig = posts.filter((p) => p.kind !== 'reaction')
    return sig[sig.length - 1]?.id ?? null
  }, [posts])

  useMessengerThreadReadCoordinator({
    conversationId: conversationId.trim(),
    kind: 'channel',
    enabled: Boolean(
      user?.id &&
        conversationId.trim() &&
        canView &&
        !commentsModalPostId &&
        !threadLoading &&
        channelLastSignificantPostId,
    ),
    threadLoading,
    scrollRef: postsFeedScrollRef,
    readTailRef: channelFeedEndRef,
    lastSignificantMessageId: channelLastSignificantPostId,
    onMarkedRead: () => requestMessengerUnreadRefresh(),
  })

  /** Хвост ленты после загрузки: флаг pending переживает батч threadLoading true→false без промежуточного paint. */
  useLayoutEffect(() => {
    cancelPostsFeedTailCatchupRef.current?.()
    cancelPostsFeedTailCatchupRef.current = null

    if (!canView || threadLoading || !pendingChannelTailScrollRef.current) {
      return () => {
        cancelPostsFeedTailCatchupRef.current?.()
        cancelPostsFeedTailCatchupRef.current = null
      }
    }

    const rows = postsForFeedScrollRef.current
    const n = rows.filter((m) => m.kind !== 'reaction').length
    if (n === 0) {
      pendingChannelTailScrollRef.current = false
      return () => {
        cancelPostsFeedTailCatchupRef.current?.()
        cancelPostsFeedTailCatchupRef.current = null
      }
    }

    const cid = conversationId.trim()
    const scrollEl = postsFeedScrollRef.current
    const contentEl = postsFeedContentRef.current

    const applyTailScroll = () => {
      const el = postsFeedScrollRef.current
      const ce = postsFeedContentRef.current
      if (!el) return false
      pendingChannelTailScrollRef.current = false
      feedPinnedToBottomRef.current = true
      el.scrollTop = el.scrollHeight
      channelFeedEndRef.current?.scrollIntoView({ block: 'end', inline: 'nearest' })
      if (ce) {
        cancelPostsFeedTailCatchupRef.current = attachMessengerTailCatchupAfterContentPaint({
          scrollEl: el,
          contentEl: ce,
          pinRef: feedPinnedToBottomRef,
          isActive: () => cidRef.current.trim() === cid,
        })
      }
      return true
    }

    if (!scrollEl) {
      let raf0 = 0
      let raf1 = 0
      raf0 = requestAnimationFrame(() => {
        raf1 = requestAnimationFrame(() => {
          if (!pendingChannelTailScrollRef.current) return
          if (cidRef.current.trim() !== cid) return
          if (!applyTailScroll()) pendingChannelTailScrollRef.current = false
        })
      })
      return () => {
        cancelAnimationFrame(raf0)
        cancelAnimationFrame(raf1)
        cancelPostsFeedTailCatchupRef.current?.()
        cancelPostsFeedTailCatchupRef.current = null
      }
    }

    applyTailScroll()

    return () => {
      cancelPostsFeedTailCatchupRef.current?.()
      cancelPostsFeedTailCatchupRef.current = null
    }
  }, [threadLoading, canView, conversationId])

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

  const hasFeedComposerSendPayload =
    feedDraft.trim().length > 0 || pendingChannelPhotos.length > 0
  const showFeedSendIcon = hasFeedComposerSendPayload && !feedVoiceRecording
  const showFeedMic = !hasFeedComposerSendPayload || feedVoiceRecording
  const showFeedVoiceMetaStrip = isMobileMessenger
  const feedSendDisabled =
    (!feedDraft.trim() && pendingChannelPhotos.length === 0) ||
    feedSending ||
    threadLoading ||
    feedPhotoUploading ||
    feedVoiceUploading

  const adjustFeedComposerHeight = useCallback(() => {
    const ta = feedComposerTextareaRef.current
    if (!ta) return
    const vv = window.visualViewport
    const vh = vv?.height ?? window.innerHeight
    const maxH = isMobileMessenger ? Math.round(vh * 0.28) : Math.min(260, Math.round(vh * 0.32))
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, maxH)}px`
  }, [isMobileMessenger])

  useLayoutEffect(() => {
    adjustFeedComposerHeight()
  }, [feedDraft, isMobileMessenger, threadLoading, adjustFeedComposerHeight])

  useEffect(() => {
    setPendingChannelPhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl)
      return []
    })
  }, [conversationId])

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
    void listChannelPostsPage(cid, { limit: 50 }).then((res) => {
      if (res.error) {
        setError(res.error)
        return
      }
      setPosts(res.data ?? [])
      setHasMoreOlder(res.hasMoreOlder)
      const list = (res.data ?? []).filter((m) => m.kind !== 'reaction')
      onTouchTail?.(messengerConversationListTailPatch(list))
    })
  }, [conversationId, user?.id, onTouchTail, canView])

  const shareChannelPostLink = useCallback(
    async (postId: string) => {
      const cid = conversationId.trim()
      if (!cid || postId.startsWith('local-')) return
      const path = buildMessengerUrl(cid, undefined, undefined, { messageId: postId })
      const abs = `${window.location.origin}${path}`
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
          await navigator.share({ title: 'Пост в канале', url: abs })
        } else {
          await copyTextToClipboard(abs)
          toast.push({ tone: 'success', message: 'Ссылка скопирована', ms: 2400 })
        }
      } catch (e) {
        const err = e as { name?: string }
        if (err?.name === 'AbortError') return
        try {
          await copyTextToClipboard(abs)
          toast.push({ tone: 'success', message: 'Ссылка скопирована', ms: 2400 })
        } catch {
          toast.push({ tone: 'error', message: 'Не удалось поделиться', ms: 3200 })
        }
      }
    },
    [conversationId, toast],
  )

  const addPendingChannelPhotoFiles = useCallback(
    (files: File[]) => {
      const imgs = files.filter((f) => f.type.startsWith('image/') && f.size > 0)
      const tooBig = imgs.filter((f) => f.size > MESSENGER_PHOTO_INPUT_MAX_BYTES)
      if (tooBig.length > 0) {
        toast.push({
          tone: 'warning',
          title: 'Слишком большой файл',
          message: 'Каждое фото не больше 20 МБ.',
          ms: 4200,
        })
      }
      const allowed = imgs.filter((f) => f.size <= MESSENGER_PHOTO_INPUT_MAX_BYTES)
      setPendingChannelPhotos((prev) => {
        const next = [...prev]
        let skipped = 0
        for (const f of allowed) {
          if (next.length >= MESSENGER_GALLERY_MAX_ATTACH) {
            skipped += 1
            continue
          }
          next.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            file: f,
            previewUrl: URL.createObjectURL(f),
          })
        }
        if (skipped > 0) {
          toast.push({
            tone: 'warning',
            message: `Не более ${MESSENGER_GALLERY_MAX_ATTACH} фото за раз`,
            ms: 3200,
          })
        }
        return next
      })
    },
    [toast],
  )

  const removePendingChannelPhoto = useCallback((id: string) => {
    setPendingChannelPhotos((prev) => {
      const cur = prev.find((p) => p.id === id)
      if (cur) URL.revokeObjectURL(cur.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const sendChannelFeed = useCallback(async () => {
    const cid = conversationId.trim()
    const body = feedDraft.trim()
    if (!canCreatePosts || !user?.id || !cid || feedSending || threadLoading || feedVoiceUploading) return
    const hasPending = pendingChannelPhotos.length > 0
    if (!hasPending && !body) return

    const snap = profile?.display_name?.trim() || 'Вы'

    if (hasPending) {
      setFeedSending(true)
      setFeedPhotoUploading(true)
      setError(null)
      const uploaded: Array<{ path: string; thumbPath?: string }> = []
      for (const p of pendingChannelPhotos) {
        const up = await uploadMessengerImage(cid, p.file)
        if (up.error || !up.path) {
          setError(up.error ?? 'Не удалось загрузить фото')
          setFeedSending(false)
          setFeedPhotoUploading(false)
          return
        }
        uploaded.push({ path: up.path, ...(up.thumbPath ? { thumbPath: up.thumbPath } : {}) })
      }
      const imageMeta =
        uploaded.length === 1 ? { image: uploaded[0]! } : { images: uploaded }
      const res = await appendChannelFeedMessage(cid, {
        kind: 'image',
        body,
        meta: imageMeta as Record<string, unknown>,
      })
      if (res.error) {
        setError(res.error)
        setFeedSending(false)
        setFeedPhotoUploading(false)
        return
      }
      for (const p of pendingChannelPhotos) URL.revokeObjectURL(p.previewUrl)
      setPendingChannelPhotos([])
      resetFeedDraft()
      setFeedPhotoUploading(false)
      setFeedSending(false)
      const createdAt = res.data?.createdAt ?? new Date().toISOString()
      const newMsg: DirectMessage = {
        id: res.data?.messageId ?? `local-${Date.now()}`,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'image',
        body,
        createdAt,
        meta: imageMeta,
      }
      setPosts((prev) => [...prev, newMsg].sort(sortChrono))
      onTouchTail?.({
        lastMessageAt: createdAt,
        lastMessagePreview: previewTextForDirectMessageTail({ kind: 'image', body, meta: imageMeta }),
      })
      requestAnimationFrame(() => {
        const el = postsFeedScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
        channelFeedEndRef.current?.scrollIntoView({ block: 'end', inline: 'nearest' })
      })
      return
    }

    setFeedSending(true)
    setError(null)
    const effectivePreview = await ensureLinkPreviewForBody(body, feedLinkPreview)
    const linkMeta = buildLinkMetaForMessageBody(body, effectivePreview)
    const metaRecord = linkMeta ? (linkMeta as Record<string, unknown>) : null
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: snap,
      kind: 'text',
      body,
      createdAt: new Date().toISOString(),
      ...(linkMeta ? { meta: linkMeta } : {}),
    }
    setPosts((prev) => [...prev, optimistic].sort(sortChrono))
    resetFeedDraft()
    const res = await appendChannelFeedMessage(cid, { kind: 'text', body, meta: metaRecord })
    if (res.error) {
      setError(res.error)
      setPosts((prev) => prev.filter((m) => m.id !== optimistic.id))
      setFeedDraft(body)
      setFeedSending(false)
      return
    }
    const finalId = res.data?.messageId ?? optimistic.id
    const finalAt = res.data?.createdAt ?? optimistic.createdAt
    setPosts((prev) =>
      prev.map((m) =>
        m.id === optimistic.id
          ? {
              ...optimistic,
              id: finalId,
              createdAt: finalAt,
              meta: linkMeta ?? optimistic.meta,
            }
          : m,
      ),
    )
    onTouchTail?.({ lastMessageAt: finalAt, lastMessagePreview: body })
    setFeedSending(false)
    requestAnimationFrame(() => {
      const el = postsFeedScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      channelFeedEndRef.current?.scrollIntoView({ block: 'end', inline: 'nearest' })
    })
  }, [
    canCreatePosts,
    user?.id,
    conversationId,
    feedDraft,
    feedSending,
    threadLoading,
    pendingChannelPhotos,
    profile?.display_name,
    feedLinkPreview,
    onTouchTail,
    feedVoiceUploading,
    resetFeedDraft,
  ])

  const onFeedVoiceRecorded = useCallback(
    async (blob: Blob, durationSec: number) => {
      const cid = conversationId.trim()
      const body = feedDraft.trim()
      if (!canCreatePosts || !user?.id || !cid || feedSending || threadLoading || feedVoiceUploading || feedPhotoUploading)
        return
      const snap = profile?.display_name?.trim() || 'Вы'
      setFeedSending(true)
      setFeedVoiceUploading(true)
      setError(null)
      const up = await uploadMessengerAudio(cid, blob)
      if (up.error || !up.path) {
        setError(up.error ?? 'Не удалось загрузить аудио')
        setFeedVoiceUploading(false)
        setFeedSending(false)
        return
      }
      const dur = Math.round(durationSec * 10) / 10
      const audioMeta: DirectMessage['meta'] = { audio: { path: up.path, durationSec: dur } }
      const res = await appendChannelFeedMessage(cid, {
        kind: 'audio',
        body,
        meta: audioMeta as Record<string, unknown>,
      })
      if (res.error) {
        setError(res.error)
        setFeedVoiceUploading(false)
        setFeedSending(false)
        return
      }
      resetFeedDraft()
      setFeedVoiceUploading(false)
      setFeedSending(false)
      const createdAt = res.data?.createdAt ?? new Date().toISOString()
      const newMsg: DirectMessage = {
        id: res.data?.messageId ?? `local-${Date.now()}`,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'audio',
        body,
        createdAt,
        meta: audioMeta,
      }
      setPosts((prev) => [...prev, newMsg].sort(sortChrono))
      onTouchTail?.({
        lastMessageAt: createdAt,
        lastMessagePreview: previewTextForDirectMessageTail({ kind: 'audio', body, meta: audioMeta }),
      })
      requestAnimationFrame(() => {
        const el = postsFeedScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
        channelFeedEndRef.current?.scrollIntoView({ block: 'end', inline: 'nearest' })
      })
    },
    [
      canCreatePosts,
      user?.id,
      conversationId,
      feedDraft,
      feedSending,
      threadLoading,
      feedVoiceUploading,
      feedPhotoUploading,
      profile?.display_name,
      onTouchTail,
      resetFeedDraft,
    ],
  )

  const onFeedComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (threadLoading || feedPhotoUploading || feedVoiceUploading) return
      const files = extractClipboardImageFiles(e.clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      addPendingChannelPhotoFiles(files)
    },
    [threadLoading, feedPhotoUploading, feedVoiceUploading, addPendingChannelPhotoFiles],
  )

  const insertEmojiInFeedDraft = useCallback(
    (emoji: string) => {
      const ta = feedComposerTextareaRef.current
      const start = ta?.selectionStart ?? feedDraft.length
      const end = ta?.selectionEnd ?? feedDraft.length
      const next = feedDraft.slice(0, start) + emoji + feedDraft.slice(end)
      setFeedDraft(next)
      setFeedComposerEmojiOpen(false)
      queueMicrotask(() => {
        ta?.focus()
        const p = start + emoji.length
        ta?.setSelectionRange(p, p)
        adjustFeedComposerHeight()
      })
    },
    [feedDraft, adjustFeedComposerHeight],
  )

  useEffect(() => {
    if (!feedComposerEmojiOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0] ? (e.touches[0]!.target as EventTarget) : (e as MouseEvent).target
      if (shouldClosePopoverOnOutsidePointer(feedComposerEmojiWrapRef.current, target)) {
        setFeedComposerEmojiOpen(false)
      }
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [feedComposerEmojiOpen])

  useEffect(() => {
    if (feedVoiceRecording) setFeedComposerEmojiOpen(false)
  }, [feedVoiceRecording])

  useEffect(() => {
    let active = true
    const cid = conversationId.trim()
    if (!user?.id || !cid || !canView) return
    cancelPostsFeedTailCatchupRef.current?.()
    cancelPostsFeedTailCatchupRef.current = null
    feedPinnedToBottomRef.current = true
    pendingChannelTailScrollRef.current = true
    setBackgroundRefreshing(false)
    setThreadLoading(true)
    setError(null)
    setPosts([])
    setReactions([])
    setCommentsModalPostId(null)
    setCommentsByPostId({})
    setCommentCountByPostId({})
    setCommentCountHasMoreByPostId({})
    seenChannelCommentIdsRef.current.clear()

    void (async () => {
      const cached = await loadCachedChannelFeed(cid)
      if (!active) return
      const hadCache = Boolean(cached?.posts?.length)
      if (cached) {
        setPosts(cached.posts ?? [])
        setHasMoreOlder(Boolean(cached.hasMoreOlder))
        setThreadLoading(false)
        pendingChannelTailScrollRef.current = true
        setBackgroundRefreshing(true)
      }

      if (!messengerOnline) {
        if (!active) return
        setThreadLoading(false)
        setBackgroundRefreshing(false)
        if (!hadCache) {
          pendingChannelTailScrollRef.current = false
          setError('Нет сети.')
        }
        return
      }

      const res = await listChannelPostsPage(cid, { limit: 50 })
      if (!active) return
      setThreadLoading(false)
      setBackgroundRefreshing(false)
      if (res.error) {
        if (!hadCache) {
          pendingChannelTailScrollRef.current = false
          setError(res.error)
        }
        return
      }
      const nextPosts = (res.data ?? []).filter((m) => m.kind !== 'reaction')
      setPosts(nextPosts)
      setHasMoreOlder(res.hasMoreOlder)
      if (!hadCache) pendingChannelTailScrollRef.current = true
      void saveCachedChannelFeed(cid, nextPosts, Boolean(res.hasMoreOlder))

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
    })()
    return () => {
      active = false
      setBackgroundRefreshing(false)
      cancelPostsFeedTailCatchupRef.current?.()
      cancelPostsFeedTailCatchupRef.current = null
    }
  }, [conversationId, user?.id, canView, messengerOnline])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !user?.id || !canView) return
    const channel = supabase.channel(`channel-thread:${cid}`)
    const filter = `conversation_id=eq.${cid}`
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const msg = mapDirectMessageFromRow(payload.new as Record<string, unknown>)
        if (!msg.id) return
        if (cidRef.current.trim() !== cid) return
        if (msg.kind === 'reaction') {
          setReactions((prev) => (prev.some((r) => r.id === msg.id) ? prev : [...prev, msg].sort(sortChrono)))
          return
        }
        if (!msg.replyToMessageId) {
          setPosts((prev) => {
            if (prev.some((p) => p.id === msg.id)) return prev
            const withoutMatchingOptimistic = prev.filter((p) => {
              if (!p.id.startsWith('local-')) return true
              if (p.senderUserId !== msg.senderUserId) return true
              if (p.kind !== msg.kind) return true
              if ((p.body ?? '') !== (msg.body ?? '')) return true
              return false
            })
            return [...withoutMatchingOptimistic, msg].sort(sortChrono)
          })
          onTouchTail?.({
            lastMessageAt: msg.createdAt,
            lastMessagePreview: previewTextForDirectMessageTail(msg),
          })
          if (feedPinnedToBottomRef.current) {
            requestAnimationFrame(() => {
              const el = postsFeedScrollRef.current
              if (el) el.scrollTop = el.scrollHeight
              channelFeedEndRef.current?.scrollIntoView({ block: 'end', inline: 'nearest' })
            })
          }
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

        setPosts((prev) => {
          const next = prev.filter((p) => p.id !== id)
          queueMicrotask(() => onTouchTail?.(messengerConversationListTailPatch(next)))
          return next
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user?.id, onTouchTail, removeReactionMessageEverywhere])

  const reactionFetchTargets = useMemo(() => {
    const postIds = posts.filter((p) => p.kind !== 'reaction').map((p) => p.id)
    const commentIds: string[] = []
    for (const arr of Object.values(commentsByPostId)) {
      for (const c of arr) {
        if (c.kind !== 'reaction') commentIds.push(c.id)
      }
    }
    return [...new Set([...postIds, ...commentIds])].sort()
  }, [posts, commentsByPostId])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !canView) return
    const targets = reactionFetchTargets
    if (targets.length === 0) return
    let cancelled = false
    void listChannelReactionsForTargets(cid, targets).then((res) => {
      if (cancelled || res.error) return
      const fetched = res.data ?? []
      const tset = new Set(targets)
      setReactions((prev) => {
        const kept = prev.filter((r) => {
          if (r.kind !== 'reaction') return false
          const t = r.meta?.react_to?.trim() ?? ''
          return !t || !tset.has(t)
        })
        const byId = new Map(kept.map((r) => [r.id, r]))
        for (const r of fetched) {
          if (r.kind === 'reaction' && r.id) byId.set(r.id, r)
        }
        return [...byId.values()].sort(sortChrono)
      })
    })
    return () => {
      cancelled = true
    }
  }, [conversationId, canView, reactionFetchTargets])

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
    const prevMap = signedUrlByPathRef.current
    const missing = [...paths].filter((p) => !prevMap[p])
    if (missing.length === 0) return
    void (async () => {
      const patch = await resolveMediaUrlsForStoragePaths(missing, { expiresSec: 3600, concurrency: 8 })
      if (!active) return
      if (Object.keys(patch).length === 0) return
      setSignedUrlByPath((prev) => {
        let next = prev
        let touched = false
        for (const [k, v] of Object.entries(patch)) {
          if (prev[k]) continue
          if (!touched) {
            next = { ...prev }
            touched = true
          }
          next[k] = v
        }
        return next
      })
    })()
    return () => {
      active = false
    }
  }, [posts, commentsByPostId])

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
      const res = await listChannelPostsPage(cid, { limit: 50, before: { createdAt: oldest.createdAt, id: oldest.id } })
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
        setPosts((prev) => {
          const next = prev.filter((m) => m.id !== postId)
          queueMicrotask(() => onTouchTail?.(messengerConversationListTailPatch(next)))
          return next
        })
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
    [commentsModalPostId, conversationId, deleteBusy, user?.id, onTouchTail],
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
    const mdBlock = injectMentionsInReactTree(
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
            {messengerBodyForMarkdown(m.body ?? '')}
          </ReactMarkdown>
      </div>,
      onMentionSlug,
    )
    const md = link ? (
      <div className="messenger-md-link-stack">
        <MessengerLinkPreviewCard link={link} />
        {mdBlock}
      </div>
    ) : (
      <>{mdBlock}</>
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

  const canEditChannelComment = (m: DirectMessage) =>
    Boolean(
      user?.id &&
        !m.id.startsWith('local-') &&
        (m.kind === 'text' || m.kind === 'image') &&
        (m.senderUserId === user.id || canModerateChannel),
    )

  const canDeleteChannelComment = (m: DirectMessage) =>
    Boolean(
      user?.id &&
        !m.id.startsWith('local-') &&
        (m.kind === 'text' || m.kind === 'image' || m.kind === 'audio') &&
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
            (m.kind === 'text' || m.kind === 'image' || m.kind === 'audio'),
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
          {p.kind === 'image' ? (
            <>
              <PostPublicationLine publishedAt={p.createdAt} editedAt={p.editedAt} />
              <MessengerBubbleBody
                message={p}
                onMentionSlug={onMentionSlug}
                onOpenImageLightbox={(ctx) => setChannelFeedLightbox({ urls: ctx.urls, index: ctx.initialIndex })}
              />
            </>
          ) : p.kind === 'audio' ? (
            <>
              <PostPublicationLine publishedAt={p.createdAt} editedAt={p.editedAt} />
              <MessengerBubbleBody message={p} onMentionSlug={onMentionSlug} />
            </>
          ) : p.meta?.postDraft ? (
            <PostDraftReadView
              className="post-draft-read--channel-feed"
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
          <div className="dashboard-messenger__channel-post-footer-actions">
            <button
              type="button"
              className="dashboard-messenger__channel-post-share"
              aria-label="Поделиться ссылкой на пост"
              title="Поделиться"
              disabled={p.id.startsWith('local-')}
              onClick={() => void shareChannelPostLink(p.id)}
            >
              <FiRrIcon name="share" />
            </button>
            {!viewerOnly ? (
              <>
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
              </>
            ) : null}
          </div>
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
    if (p.kind === 'audio') {
      const raw = (p.body ?? '').replace(/\s+/g, ' ').trim()
      return raw || 'Голосовое сообщение'
    }
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
      <div className="dashboard-messenger__scroll-region-wrap">
        <div
          ref={postsFeedScrollRef}
          className="dashboard-messenger__messages-scroll"
          role="region"
          aria-label="Посты канала"
          onScroll={updateFeedPinnedToBottom}
        >
        {hasMoreOlder ? (
          <div style={{ padding: 10, textAlign: 'center' }}>
            <button type="button" className="dashboard-topbar__action" disabled={loadingOlder} onClick={() => void loadOlder()}>
              {loadingOlder ? 'Загрузка…' : 'Показать старше'}
            </button>
          </div>
        ) : null}

        {threadLoading && posts.filter((m) => m.kind !== 'reaction').length === 0 ? (
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
            {backgroundRefreshing ? (
              <div className="dashboard-messenger__list-ptr-banner" role="status" aria-live="polite">
                <span>Обновление…</span>
              </div>
            ) : null}
            <div ref={postsFeedContentRef} className="dashboard-messenger__channel-feed">
              {posts
                .filter((m) => m.kind !== 'reaction')
                .map((p) => renderChannelPostCard(p))}
              <div ref={channelFeedEndRef} className="dashboard-messenger__channel-feed-end" aria-hidden />
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
        <MessengerJumpToBottomFab visible={showPostsJump} onClick={jumpPostsBottom} />
      </div>

      <div className="dashboard-messenger__thread-footer">
        {canCreatePosts ? (
          <div className="dashboard-messenger__composer" role="region" aria-label="Новый пост в канале">
            {pendingChannelPhotos.length > 0 ? (
              <div className="dashboard-messenger__pending-photos">
                {pendingChannelPhotos.map((p, idx) => (
                  <div key={p.id} className="dashboard-messenger__pending-photo">
                    <button
                      type="button"
                      className="dashboard-messenger__pending-photo-open"
                      title="Открыть"
                      aria-label="Открыть изображение"
                      onClick={() =>
                        setChannelFeedLightbox({
                          urls: pendingChannelPhotos.map((x) => x.previewUrl),
                          index: idx,
                        })
                      }
                    >
                      <img src={p.previewUrl} alt="" />
                    </button>
                    <button
                      type="button"
                      className="dashboard-messenger__pending-photo-remove"
                      aria-label="Убрать фото"
                      onClick={(e) => {
                        e.stopPropagation()
                        removePendingChannelPhoto(p.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <DraftLinkPreviewBar
              preview={feedLinkPreview}
              loading={feedLinkPreviewLoading}
              onDismiss={dismissFeedLinkPreview}
            />
            {showFeedVoiceMetaStrip ? (
              <div
                ref={setFeedVoiceMetaEl}
                className="dashboard-messenger__composer-voice-meta dashboard-messenger__composer-voice-meta--strip"
                aria-live="polite"
              />
            ) : null}
            <div
              className={`dashboard-messenger__composer-main dashboard-messenger__composer-main--row${
                feedVoiceRecording ? ' dashboard-messenger__composer-main--voice-rec-mobile' : ''
              }`}
            >
              <button
                type="button"
                className="dashboard-messenger__composer-icon-btn"
                title="Фото"
                aria-label="Прикрепить фото"
                disabled={threadLoading || feedPhotoUploading || feedVoiceUploading}
                onClick={() => feedPhotoInputRef.current?.click()}
              >
                <AttachmentIcon />
              </button>
              <div className="dashboard-messenger__composer-input-wrap">
                <textarea
                  ref={feedComposerTextareaRef}
                  className="dashboard-messenger__input"
                  rows={1}
                  placeholder="Напиши пост…"
                  value={feedDraft}
                  disabled={threadLoading || feedPhotoUploading || feedVoiceUploading}
                  onPaste={onFeedComposerPaste}
                  onChange={(e) => {
                    setFeedDraft(e.target.value)
                    queueMicrotask(() => adjustFeedComposerHeight())
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      void sendChannelFeed()
                    }
                  }}
                />
              </div>
              <div className="dashboard-messenger__composer-trailing">
                <div
                  className={`dashboard-messenger__composer-tools${
                    feedVoiceRecording ? ' dashboard-messenger__composer-tools--voice-rec' : ''
                  }`}
                  ref={feedComposerEmojiWrapRef}
                >
                  {feedComposerEmojiOpen ? (
                    <div className="dashboard-messenger__composer-emoji-pop">
                      <ReactionEmojiPopover
                        title="Эмодзи"
                        emojis={MESSENGER_COMPOSER_EMOJIS}
                        onClose={() => setFeedComposerEmojiOpen(false)}
                        onPick={(em) => insertEmojiInFeedDraft(em)}
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="dashboard-messenger__composer-icon-btn"
                    title="Эмодзи"
                    aria-label="Вставить эмодзи"
                    disabled={threadLoading}
                    onClick={() => setFeedComposerEmojiOpen((v) => !v)}
                  >
                    😀
                  </button>
                  <button
                    type="button"
                    className="dashboard-messenger__composer-icon-btn"
                    title="Оформленный пост"
                    aria-label="Оформленный пост: заголовок, обложка, блоки"
                    disabled={threadLoading || feedSending}
                    onClick={() => setPostEditor({ mode: 'create' })}
                  >
                    <FiRrIcon name="stars" />
                  </button>
                  {showFeedMic ? (
                    <MessengerVoiceRecordBtn
                      variant={isMobileMessenger ? 'mobileEnd' : 'default'}
                      metaPortalEl={isMobileMessenger ? feedVoiceMetaEl : undefined}
                      disabled={threadLoading}
                      busy={feedPhotoUploading || feedVoiceUploading || feedSending}
                      onRecorded={onFeedVoiceRecorded}
                      onRecordingChange={setFeedVoiceRecording}
                    />
                  ) : null}
                  <input
                    ref={feedPhotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="dashboard-messenger__photo-input"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      e.target.value = ''
                      if (files.length === 0) return
                      addPendingChannelPhotoFiles(files)
                    }}
                  />
                </div>
                {showFeedSendIcon ? (
                  <button
                    type="button"
                    className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn dashboard-messenger__send-btn--icon"
                    title="Отправить (Ctrl+Enter)"
                    aria-label="Опубликовать пост"
                    disabled={feedSendDisabled}
                    onClick={() => void sendChannelFeed()}
                  >
                    <MessengerSendPlaneIcon />
                  </button>
                ) : null}
              </div>
            </div>
            {feedPhotoUploading || feedVoiceUploading ? (
              <p className="dashboard-messenger__photo-status" role="status">
                {feedVoiceUploading ? 'Загрузка аудио…' : 'Загрузка фото…'}
              </p>
            ) : null}
          </div>
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

        <div className="dashboard-messenger__scroll-region-wrap dashboard-messenger__scroll-region-wrap--channel-comments">
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
          <MessengerJumpToBottomFab visible={showCommentsJump} onClick={jumpCommentsBottom} />
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
                {draft.trim() || sending ? (
                  <button
                    type="button"
                    className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn dashboard-messenger__send-btn--icon"
                    title="Отправить"
                    aria-label={sending ? 'Отправка…' : 'Отправить комментарий'}
                    disabled={!canSend}
                    onClick={() => void sendComment(commentsModalPostId)}
                  >
                    {sending ? '…' : <MessengerSendPlaneIcon />}
                  </button>
                ) : null}
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
                    (postMenu.post.kind === 'text' ||
                      postMenu.post.kind === 'image' ||
                      postMenu.post.kind === 'audio' ||
                      postMenu.post.kind === 'system'),
                )}
                canCopy={Boolean(
                  !postMenu.post.id.startsWith('local-') &&
                    (postMenu.post.kind === 'text' ||
                      postMenu.post.kind === 'image' ||
                      postMenu.post.kind === 'audio' ||
                      postMenu.post.kind === 'system'),
                )}
                canDelete={Boolean(
                  user?.id &&
                    postMenu.post.senderUserId === user.id &&
                    !postMenu.post.id.startsWith('local-') &&
                    (postMenu.post.kind === 'text' ||
                      postMenu.post.kind === 'image' ||
                      postMenu.post.kind === 'audio' ||
                      postMenu.post.kind === 'system'),
                )}
                onClose={() => setPostMenu(null)}
                onCopy={async () => {
                  const text = previewTextForDirectMessageTail(postMenu.post)
                  const ok = await copyTextToClipboard(text)
                  toast.push({
                    tone: ok ? 'success' : 'error',
                    message: ok ? 'Скопировано в буфер обмена' : 'Не удалось скопировать',
                    ms: 2200,
                  })
                }}
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
                  (postMenu.post.kind === 'text' ||
                    postMenu.post.kind === 'image' ||
                    postMenu.post.kind === 'audio')
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
                canEdit={canEditChannelComment(commentMenu.message)}
                canCopy={Boolean(
                  !commentMenu.message.id.startsWith('local-') &&
                    (commentMenu.message.kind === 'text' ||
                      commentMenu.message.kind === 'image' ||
                      commentMenu.message.kind === 'audio'),
                )}
                canDelete={canDeleteChannelComment(commentMenu.message)}
                onClose={() => setCommentMenu(null)}
                onCopy={async () => {
                  const text = previewTextForDirectMessageTail(commentMenu.message)
                  const ok = await copyTextToClipboard(text)
                  toast.push({
                    tone: ok ? 'success' : 'error',
                    message: ok ? 'Скопировано в буфер обмена' : 'Не удалось скопировать',
                    ms: 2200,
                  })
                }}
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
                  (commentMenu.message.kind === 'text' ||
                    commentMenu.message.kind === 'image' ||
                    commentMenu.message.kind === 'audio')
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

      <MessengerImageLightbox
        open={Boolean(channelFeedLightbox && channelFeedLightbox.urls.length > 0)}
        urls={channelFeedLightbox?.urls ?? []}
        initialIndex={channelFeedLightbox?.index ?? 0}
        onClose={() => setChannelFeedLightbox(null)}
      />

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

