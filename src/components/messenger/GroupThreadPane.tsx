import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useMessengerThreadReadCoordinator } from '../../hooks/useMessengerThreadReadCoordinator'
import { shouldClosePopoverOnOutsidePointer } from '../../utils/popoverOutsideClick'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../hooks/useProfile'
import { useStableMobileMessenger } from '../../hooks/useStableMobileMessenger'
import { useToast } from '../../context/ToastContext'
import { fetchJson } from '../../api/http'
import { subscribeThread } from '../../api/messengerRealtime'
import { truncateMessengerReplySnippet } from '../../lib/messengerUi'
import { buildQuotePreview } from '../../lib/messengerQuotePreview'
import { MESSENGER_COMPOSER_EMOJIS } from '../../lib/messengerComposerEmojis'
import {
  mapDirectMessageFromRow,
  messengerConversationListTailPatch,
  previewTextForDirectMessageTail,
  type DirectMessage,
  type MessengerForwardNav,
} from '../../lib/messenger'
import { uploadMessengerAudio, uploadMessengerImage } from '../../lib/messenger'
import {
  appendGroupMessage,
  deleteGroupMessage,
  listGroupMessagesPage,
  toggleGroupMessageReaction,
  isAllowedReactionEmoji,
} from '../../lib/groups'
import { requestMessengerUnreadRefresh } from '../../lib/messenger'
import { readMessengerThreadTailCache, writeMessengerThreadTailCache } from '../../lib/messengerThreadTailCache'
import type { ReactionEmoji } from '../../types/roomComms'
import { MessengerMessageMenuPopover } from '../MessengerMessageMenuPopover'
import { AttachmentIcon, FiRrIcon, MessengerSendPlaneIcon } from '../icons'
import {
  copyTextToClipboard,
  extractClipboardImageFiles,
  MESSENGER_GALLERY_MAX_ATTACH,
  MESSENGER_PHOTO_INPUT_MAX_BYTES,
  formatMessengerDaySeparatorLabel,
  messengerPeerDisplayTitle,
} from '../../lib/messengerDashboardUtils'
import { ThreadMessageBubble } from './ThreadMessageBubble'
import { useDevRenderTrace } from '../../lib/devTrace'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'
import { useLinkPreviewFromText } from '../../hooks/useLinkPreviewFromText'
import { buildLinkMetaForMessageBody, ensureLinkPreviewForBody } from '../../lib/linkPreview'
import { attachMessengerTailCatchupAfterContentPaint } from '../../hooks/messengerTailCatchup'
import { useMessengerJumpToBottom } from '../../hooks/useMessengerJumpToBottom'
import { useMessengerPeerAliasesForMessages } from '../../hooks/useMessengerPeerAliasesForMessages'
import { useMessengerPerConversationDraft } from '../../hooks/useMessengerPerConversationDraft'
import { useMobileMessengerComposerHeight } from '../../hooks/useMobileMessengerComposerHeight'
import { MessengerJumpToBottomFab } from '../MessengerJumpToBottomFab'
import { DraftLinkPreviewBar } from './DraftLinkPreviewBar'
import { MessengerImageLightbox } from './MessengerImageLightbox'
import { MessengerVoiceRecordBtn } from './MessengerVoiceRecordBtn'
import { MentionAutocomplete } from './MentionAutocomplete'

const QUICK_REACTION_EMOJI: ReactionEmoji = '❤️'

function formatGroupBubbleTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function sortChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

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

export function GroupThreadPane({
  conversationId,
  messengerOnline = true,
  onTouchTail,
  onForwardMessage,
  onMentionSlug,
  isMemberHint,
  viewerOnly,
  publicJoinCta,
  joinRequestPending,
  jumpToMessageId,
  onJumpHandled,
  onForwardSourceNavigate,
}: {
  conversationId: string
  /** Состояние сети с уровня страницы мессенджера (офлайн → кэш хвоста). */
  messengerOnline?: boolean
  onTouchTail?: (patch: { lastMessageAt: string; lastMessagePreview: string }) => void
  onForwardMessage?: (message: DirectMessage) => void
  onForwardSourceNavigate?: (nav: MessengerForwardNav) => void
  onMentionSlug?: (slug: string) => void
  /** Хинт из родителя: если диалог уже есть в списке, считаем что участник (убирает рассинхрон после вступления). */
  isMemberHint?: boolean
  viewerOnly?: boolean
  /** Публичный просмотр без членства: кнопка «Вступить» в ленте, не в шапке. */
  publicJoinCta?: { label: string; disabled: boolean; onClick: () => void } | null
  joinRequestPending?: boolean
  jumpToMessageId?: string | null
  onJumpHandled?: () => void
}) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const toast = useToast()
  const isMobileMessenger = useStableMobileMessenger(900)
  useDevRenderTrace('GroupThreadPane', {
    conversationId,
    isMobileMessenger,
    jumpToMessageId: jumpToMessageId ?? null,
  })

  const [threadLoading, setThreadLoading] = useState(false)
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const { draft, setDraft, resetDraft } = useMessengerPerConversationDraft(conversationId)
  const [sending, setSending] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [voiceUploading, setVoiceUploading] = useState(false)
  const [pendingGroupPhotos, setPendingGroupPhotos] = useState<{ id: string; file: File; previewUrl: string }[]>([])
  const {
    preview: draftLinkPreview,
    loading: draftLinkPreviewLoading,
    dismiss: dismissDraftLinkPreview,
  } = useLinkPreviewFromText(draft, { enabled: pendingGroupPhotos.length === 0 })
  const [groupImageLightbox, setGroupImageLightbox] = useState<{ urls: string[]; index: number } | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const groupMessagesContentRef = useRef<HTMLDivElement | null>(null)
  const cancelGroupTailCatchupRef = useRef<(() => void) | null>(null)
  const pendingGroupTailScrollRef = useRef(false)
  const pinnedToBottomRef = useRef(true)
  const composerEmojiWrapRef = useRef<HTMLDivElement | null>(null)
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false)
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceMetaEl, setVoiceMetaEl] = useState<HTMLDivElement | null>(null)
  const { adjustMobileComposerHeight } = useMobileMessengerComposerHeight({
    isMobileMessenger,
    draft,
    activeConversationId: conversationId,
    editingMessageId: null,
    threadLoading,
    composerTextareaRef,
  })
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  const [messageMenu, setMessageMenu] = useState<{
    message: DirectMessage
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const messageMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const messageAnchorRef = useRef<Map<string, HTMLElement>>(new Map())
  const groupReadTailRef = useRef<HTMLDivElement | null>(null)

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setPendingGroupPhotos((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl)
      return []
    })
  }, [conversationId])

  const [myGroupMemberRole, setMyGroupMemberRole] = useState<string | null>(null)

  const hasGroupComposerSendPayload = draft.trim().length > 0 || pendingGroupPhotos.length > 0
  const showGroupSendIcon = hasGroupComposerSendPayload && !voiceRecording
  const showGroupMic = !hasGroupComposerSendPayload || voiceRecording
  const showGroupVoiceMetaStrip = isMobileMessenger
  const groupSendDisabled =
    (!draft.trim() && pendingGroupPhotos.length === 0) ||
    sending ||
    threadLoading ||
    photoUploading ||
    voiceUploading

  const isGroupMember = myGroupMemberRole !== null || isMemberHint === true
  const canView = viewerOnly || isGroupMember

  const peerAliasByUserId = useMessengerPeerAliasesForMessages(user?.id, messages, canView)

  const timelineMessages = useMemo(() => {
    const byId = new Map<string, DirectMessage>()
    const dupCounts = new Map<string, number>()
    for (const m of messages) {
      if (m.kind === 'reaction') continue
      const id = (m.id || '').trim()
      if (!id) continue
      const prev = byId.get(id)
      if (!prev) {
        byId.set(id, m)
        dupCounts.set(id, 1)
        continue
      }
      dupCounts.set(id, (dupCounts.get(id) ?? 1) + 1)
      const pt = new Date(prev.createdAt).getTime()
      const nt = new Date(m.createdAt).getTime()
      byId.set(id, Number.isFinite(nt) && (!Number.isFinite(pt) || nt >= pt) ? m : prev)
    }
    if (import.meta.env.DEV) {
      const dups = Array.from(dupCounts.entries()).filter(([, n]) => n > 1)
      if (dups.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('messenger.group: duplicate message ids from state', dups.slice(0, 10))
      }
    }
    return Array.from(byId.values()).sort(sortChrono)
  }, [messages])

  const groupLastSignificantMessageId = useMemo(
    () => timelineMessages[timelineMessages.length - 1]?.id ?? null,
    [timelineMessages],
  )

  useMessengerThreadReadCoordinator({
    conversationId: conversationId.trim(),
    kind: 'group',
    enabled: Boolean(
      user?.id &&
        conversationId.trim() &&
        canView &&
        !viewerOnly &&
        !threadLoading &&
        groupLastSignificantMessageId,
    ),
    threadLoading,
    scrollRef: messagesScrollRef,
    readTailRef: groupReadTailRef,
    lastSignificantMessageId: groupLastSignificantMessageId,
    onMarkedRead: () => requestMessengerUnreadRefresh(),
  })

  const { showJump: showGroupJump, jumpToBottom: jumpGroupBottom } = useMessengerJumpToBottom(
    messagesScrollRef,
    conversationId || '',
    timelineMessages.length,
  )

  useEffect(() => {
    let cancelled = false
    const cid = conversationId.trim()
    if (!user?.id || !cid) {
      setMyGroupMemberRole(null)
      return
    }
    void (async () => {
      const r = await fetchJson<{ row: any | null }>(`/api/v1/me/conversations/${encodeURIComponent(cid)}/membership`, { method: 'GET', auth: true })
      if (cancelled) return
      if (!r.ok || !r.data?.row) {
        setMyGroupMemberRole(null)
        return
      }
      const role = typeof (r.data.row as any)?.role === 'string' ? String((r.data.row as any).role).trim() : null
      setMyGroupMemberRole(role)
    })()
    return () => {
      cancelled = true
    }
  }, [conversationId, user?.id])

  const removeMessageById = useCallback(
    (messageId: string) => {
      const id = messageId.trim()
      if (!id) return
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== id)
        queueMicrotask(() => onTouchTail?.(messengerConversationListTailPatch(next)))
        return next
      })
    },
    [onTouchTail],
  )

  useEffect(() => {
    const id = jumpToMessageId?.trim() ?? ''
    if (!id) return
    const el = messageAnchorRef.current.get(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('dashboard-messenger__message--highlight')
    window.setTimeout(() => {
      el.classList.remove('dashboard-messenger__message--highlight')
    }, 1400)
    onJumpHandled?.()
  }, [jumpToMessageId, onJumpHandled, messages.length])

  useEffect(() => {
    let active = true
    const cid = conversationId.trim()
    if (!user?.id || !cid || !canView) return
    setThreadLoading(true)
    pendingGroupTailScrollRef.current = true
    setBackgroundRefreshing(false)
    setError(null)
    // Не чистим сообщения сразу: если есть кэш — показываем мгновенно и обновляем в фоне.
    setReplyTo(null)

    void (async () => {
      const cachedNow = await readMessengerThreadTailCache('group', cid)
      if (!active) return

      if (cachedNow?.length) {
        setMessages(cachedNow)
        setThreadLoading(false)
        setBackgroundRefreshing(Boolean(messengerOnline))
      } else {
        setMessages([])
      }

      if (!messengerOnline) {
        setBackgroundRefreshing(false)
        if (cachedNow?.length) return
        pendingGroupTailScrollRef.current = false
        setError('Нет сети. Сохранённых сообщений для этой группы нет.')
        return
      }

      const res = await listGroupMessagesPage(cid, { limit: 60 })
      if (!active) return
      setThreadLoading(false)
      setBackgroundRefreshing(false)
      if (res.error) {
        if (cachedNow?.length) return
        pendingGroupTailScrollRef.current = false
        setError(res.error)
        return
      }
      const list = res.data ?? []
      setMessages(list)
      void writeMessengerThreadTailCache('group', cid, list)
    })()

    return () => {
      active = false
      cancelGroupTailCatchupRef.current?.()
      cancelGroupTailCatchupRef.current = null
    }
  }, [conversationId, user?.id, canView, viewerOnly, isGroupMember, messengerOnline])

  useLayoutEffect(() => {
    cancelGroupTailCatchupRef.current?.()
    cancelGroupTailCatchupRef.current = null

    if (threadLoading || !pendingGroupTailScrollRef.current) return
    const sigCount = messages.filter((m) => m.kind !== 'reaction').length
    if (sigCount === 0) {
      pendingGroupTailScrollRef.current = false
      return
    }

    const cid = conversationId.trim()
    const scrollEl = messagesScrollRef.current
    const contentEl = groupMessagesContentRef.current

    const applyTailScroll = () => {
      const el = messagesScrollRef.current
      const ce = groupMessagesContentRef.current
      if (!el) return false
      pendingGroupTailScrollRef.current = false
      pinnedToBottomRef.current = true
      el.scrollTop = el.scrollHeight
      if (ce) {
        cancelGroupTailCatchupRef.current = attachMessengerTailCatchupAfterContentPaint({
          scrollEl: el,
          contentEl: ce,
          pinRef: pinnedToBottomRef,
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
          if (!pendingGroupTailScrollRef.current) return
          if (cidRef.current.trim() !== cid) return
          if (!applyTailScroll()) pendingGroupTailScrollRef.current = false
        })
      })
      return () => {
        cancelAnimationFrame(raf0)
        cancelAnimationFrame(raf1)
      }
    }

    applyTailScroll()
    requestAnimationFrame(() => {
      if (isGroupMember) composerTextareaRef.current?.focus()
    })
    return () => {
      cancelGroupTailCatchupRef.current?.()
      cancelGroupTailCatchupRef.current = null
    }
  }, [conversationId, threadLoading, messages, isGroupMember])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !messages.length || !messengerOnline) return
    const t = window.setTimeout(() => {
      void writeMessengerThreadTailCache('group', cid, messages)
    }, 700)
    return () => window.clearTimeout(t)
  }, [messages, conversationId, messengerOnline])

  const updatePinnedToBottom = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el) return
    const slack = 48
    pinnedToBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - slack
  }, [])

  useEffect(() => {
    if (!error) return
    toast.push({ tone: 'error', message: error, ms: 3800 })
    setError(null)
  }, [error, toast])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !user?.id || !canView) return
    const disableWs = String(import.meta.env.VITE_MESSENGER_DISABLE_WS ?? '').trim() === '1'
    if (disableWs) return
    const off = subscribeThread(cid, (ev) => {
      if (ev.type === 'message_created') {
        const msg = ev.message as any as DirectMessage
        if (!msg.id) return
        if (msg.senderUserId === user.id && msg.kind !== 'reaction') return
        if (cidRef.current.trim() !== cid) return
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg].sort(sortChrono)
        })
        const preview = previewTextForDirectMessageTail(msg)
        onTouchTail?.({ lastMessageAt: msg.createdAt, lastMessagePreview: preview })
        if (pinnedToBottomRef.current && msg.kind !== 'reaction') {
          requestAnimationFrame(() => {
            const el = messagesScrollRef.current
            if (el) el.scrollTop = el.scrollHeight
          })
        }
        return
      }
      if (ev.type === 'message_updated') {
        const msg = ev.message as any as DirectMessage
        if (!msg.id) return
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
        return
      }
      if (ev.type === 'message_deleted') {
        const id = ev.messageId
        if (!id || cidRef.current.trim() !== cid) return
        removeMessageById(id)
      }
    })

    return () => {
      off()
    }
  }, [conversationId, user?.id, onTouchTail, removeMessageById, viewerOnly])

  // HTTP polling fallback for groups (when WS is disabled).
  useEffect(() => {
    const disableWs = String(import.meta.env.VITE_MESSENGER_DISABLE_WS ?? '').trim() === '1'
    if (!disableWs) return
    const cid = conversationId.trim()
    if (!cid || !user?.id || !canView || !messengerOnline) return

    let destroyed = false
    let inFlight = false

    const mergeIncoming = (incoming: DirectMessage[]) => {
      setMessages((prev) => {
        if (!incoming.length) return prev
        const byId = new Map<string, DirectMessage>()
        for (const m of prev) if (m?.id) byId.set(m.id, m)
        for (const m of incoming) if (m?.id) byId.set(m.id, m)
        const merged = Array.from(byId.values()).sort(sortChrono)
        queueMicrotask(() => onTouchTail?.(messengerConversationListTailPatch(merged)))
        return merged
      })
    }

    const pollOnce = async () => {
      if (destroyed || inFlight) return
      inFlight = true
      try {
        const res = await listGroupMessagesPage(cid, { limit: 60 })
        if (destroyed) return
        if (res.error || !res.data) return
        mergeIncoming(res.data)
      } finally {
        inFlight = false
      }
    }

    void pollOnce()
    const id = window.setInterval(() => void pollOnce(), 4000)
    return () => {
      destroyed = true
      window.clearInterval(id)
    }
  }, [conversationId, user?.id, canView, messengerOnline, onTouchTail])

  const reactionsByTargetId = useMemo(() => {
    const map = new Map<string, DirectMessage[]>()
    for (const m of messages) {
      if (m.kind !== 'reaction') continue
      const tid = m.meta?.react_to?.trim()
      if (!tid) continue
      const arr = map.get(tid) ?? []
      arr.push(m)
      map.set(tid, arr)
    }
    for (const [, arr] of map) arr.sort(sortChrono)
    return map
  }, [messages])

  const toggleReaction = useCallback(
    async (targetMessageId: string, emoji: ReactionEmoji) => {
      const cid = conversationId.trim()
      const uid = user?.id
      if (!isGroupMember || !cid || !uid || !isAllowedReactionEmoji(emoji)) return
      const opKey = `${cid}::${targetMessageId}::${emoji}`
      if (reactionOpInFlightRef.current.has(opKey)) return
      reactionOpInFlightRef.current.add(opKey)
      try {
        const res = await toggleGroupMessageReaction(cid, targetMessageId, emoji)
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 2600 })
          return
        }
        const payload = res.data
        if (!payload) return

        if (payload.action === 'removed') {
          removeMessageById(payload.messageId)
          return
        }

        const target = targetMessageId.trim()
        const snap = profile?.display_name?.trim() || 'Вы'
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
        setMessages((prev) => (prev.some((m) => m.id === newRow.id) ? prev : [...prev, newRow].sort(sortChrono)))
      } finally {
        reactionOpInFlightRef.current.delete(opKey)
      }
    },
    [conversationId, toast, user?.id, profile?.display_name, removeMessageById, isGroupMember],
  )

  const onReactionChipTap = useCallback(
    async (targetMessageId: string, emoji: string) => {
      if (!isAllowedReactionEmoji(emoji)) return
      await toggleReaction(targetMessageId, emoji)
    },
    [toggleReaction],
  )

  const addPendingGroupPhotoFiles = useCallback(
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
      setPendingGroupPhotos((prev) => {
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

  const removePendingGroupPhoto = useCallback((id: string) => {
    setPendingGroupPhotos((prev) => {
      const cur = prev.find((p) => p.id === id)
      if (cur) URL.revokeObjectURL(cur.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const sendText = useCallback(async () => {
    const cid = conversationId.trim()
    const body = draft.trim()
    if (!isGroupMember || !user?.id || !cid || sending || threadLoading || voiceUploading) return

    const hasPending = pendingGroupPhotos.length > 0
    if (!hasPending && !body) return

    const replyId = replyTo?.id ?? null

    if (hasPending) {
      setSending(true)
      setPhotoUploading(true)
      setError(null)
      const uploaded: Array<{ path: string; thumbPath?: string }> = []
      for (const p of pendingGroupPhotos) {
        const up = await uploadMessengerImage(cid, p.file)
        if (up.error || !up.path) {
          setError(up.error ?? 'Не удалось загрузить фото')
          setSending(false)
          setPhotoUploading(false)
          return
        }
        uploaded.push({ path: up.path, ...(up.thumbPath ? { thumbPath: up.thumbPath } : {}) })
      }
      const imageMeta: DirectMessage['meta'] =
        uploaded.length === 1 ? { image: uploaded[0]! } : { images: uploaded }
      const res = await appendGroupMessage(cid, {
        kind: 'image',
        body,
        meta: imageMeta as Record<string, unknown>,
        replyToMessageId: replyId,
      })
      if (res.error) {
        setError(res.error)
        setSending(false)
        setPhotoUploading(false)
        return
      }
      const preview = previewTextForDirectMessageTail({ kind: 'image', body, meta: imageMeta })
      const createdAt = res.data?.createdAt ?? new Date().toISOString()
      const snap = profile?.display_name?.trim() || 'Вы'
      const newMsg: DirectMessage = {
        id: res.data?.messageId ?? `local-${Date.now()}`,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'image',
        body,
        createdAt,
        replyToMessageId: replyId,
        meta: imageMeta,
      }
      for (const p of pendingGroupPhotos) URL.revokeObjectURL(p.previewUrl)
      setPendingGroupPhotos([])
      resetDraft()
      setReplyTo(null)
      setPhotoUploading(false)
      setSending(false)
      setMessages((prev) => {
        const id = (newMsg.id || '').trim()
        const base = id ? prev.filter((m) => m.id !== id) : prev
        return [...base, newMsg].sort(sortChrono)
      })
      onTouchTail?.({ lastMessageAt: createdAt, lastMessagePreview: preview })
      return
    }

    setSending(true)
    setError(null)
    const effectiveLinkPreview = await ensureLinkPreviewForBody(body, draftLinkPreview)
    const linkMetaRecord = buildLinkMetaForMessageBody(body, effectiveLinkPreview)
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: profile?.display_name?.trim() || 'Вы',
      kind: 'text',
      body,
      createdAt: new Date().toISOString(),
      replyToMessageId: replyId,
      ...(linkMetaRecord ? { meta: linkMetaRecord } : {}),
    }
    setMessages((prev) => [...prev, optimistic].sort(sortChrono))
    resetDraft()
    setReplyTo(null)
    const res = await appendGroupMessage(cid, {
      kind: 'text',
      body,
      replyToMessageId: replyId,
      ...(linkMetaRecord ? { meta: linkMetaRecord as Record<string, unknown> } : {}),
    })
    if (res.error) {
      setError(res.error)
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(body)
      setSending(false)
      return
    }
    const finalId = res.data?.messageId ?? optimistic.id
    const finalAt = res.data?.createdAt ?? optimistic.createdAt
    setMessages((prev) => {
      const next = prev
        // If realtime already inserted the final row, drop it and keep the optimistic->final swap.
        .filter((m) => m.id !== finalId)
        .map((m) =>
          m.id === optimistic.id
            ? { ...optimistic, id: finalId, createdAt: finalAt, meta: linkMetaRecord ?? optimistic.meta }
            : m,
        )
      return next
    })
    onTouchTail?.({ lastMessageAt: finalAt, lastMessagePreview: body })
    setSending(false)
  }, [
    conversationId,
    draft,
    pendingGroupPhotos,
    sending,
    threadLoading,
    user?.id,
    replyTo?.id,
    profile?.display_name,
    onTouchTail,
    isGroupMember,
    draftLinkPreview,
    voiceUploading,
    resetDraft,
  ])

  const onVoiceRecorded = useCallback(
    async (blob: Blob, durationSec: number) => {
      const cid = conversationId.trim()
      const body = draft.trim()
      if (!isGroupMember || !user?.id || !cid || sending || threadLoading || voiceUploading || photoUploading) return
      const replyId = replyTo?.id ?? null
      setSending(true)
      setVoiceUploading(true)
      setError(null)
      const up = await uploadMessengerAudio(cid, blob)
      if (up.error || !up.path) {
        setError(up.error ?? 'Не удалось загрузить аудио')
        setVoiceUploading(false)
        setSending(false)
        return
      }
      const dur = Math.round(durationSec * 10) / 10
      const audioMeta: DirectMessage['meta'] = { audio: { path: up.path, durationSec: dur } }
      const res = await appendGroupMessage(cid, {
        kind: 'audio',
        body,
        meta: audioMeta as Record<string, unknown>,
        replyToMessageId: replyId,
      })
      if (res.error) {
        setError(res.error)
        setVoiceUploading(false)
        setSending(false)
        return
      }
      const preview = previewTextForDirectMessageTail({ kind: 'audio', body, meta: audioMeta })
      const createdAt = res.data?.createdAt ?? new Date().toISOString()
      const snap = profile?.display_name?.trim() || 'Вы'
      const newMsg: DirectMessage = {
        id: res.data?.messageId ?? `local-${Date.now()}`,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'audio',
        body,
        createdAt,
        replyToMessageId: replyId,
        meta: audioMeta,
      }
      resetDraft()
      setReplyTo(null)
      setVoiceUploading(false)
      setSending(false)
      setMessages((prev) => {
        const id = (newMsg.id || '').trim()
        const base = id ? prev.filter((m) => m.id !== id) : prev
        return [...base, newMsg].sort(sortChrono)
      })
      onTouchTail?.({ lastMessageAt: createdAt, lastMessagePreview: preview })
    },
    [
      conversationId,
      draft,
      isGroupMember,
      user?.id,
      sending,
      threadLoading,
      voiceUploading,
      photoUploading,
      replyTo?.id,
      profile?.display_name,
      onTouchTail,
      resetDraft,
    ],
  )

  const onComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (threadLoading || photoUploading || voiceUploading) return
      const files = extractClipboardImageFiles(e.clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      addPendingGroupPhotoFiles(files)
    },
    [photoUploading, voiceUploading, threadLoading, addPendingGroupPhotoFiles],
  )

  useLayoutEffect(() => {
    const el = messageMenuWrapRef.current
    if (!el || !messageMenu) return
    const { anchor } = messageMenu
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
  }, [messageMenu])

  useEffect(() => {
    if (!messageMenu) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0] ? (e.touches[0]!.target as EventTarget) : (e as MouseEvent).target
      if (shouldClosePopoverOnOutsidePointer(messageMenuWrapRef.current, target)) setMessageMenu(null)
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [messageMenu])

  useEffect(() => {
    if (!messageMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMessageMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messageMenu])

  const scrollToQuotedMessage = useCallback((quotedId: string) => {
    const el = messageAnchorRef.current.get(quotedId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('dashboard-messenger__message--highlight')
    window.setTimeout(() => {
      el.classList.remove('dashboard-messenger__message--highlight')
    }, 1400)
  }, [])

  useEffect(() => {
    if (!composerEmojiOpen) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0] ? (e.touches[0]!.target as EventTarget) : (e as MouseEvent).target
      if (shouldClosePopoverOnOutsidePointer(composerEmojiWrapRef.current, target)) {
        setComposerEmojiOpen(false)
      }
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [composerEmojiOpen])

  useEffect(() => {
    if (voiceRecording) setComposerEmojiOpen(false)
  }, [voiceRecording])

  const insertEmojiInDraft = useCallback(
    (emoji: string) => {
      const ta = composerTextareaRef.current
      const start = ta?.selectionStart ?? draft.length
      const end = ta?.selectionEnd ?? draft.length
      const next = draft.slice(0, start) + emoji + draft.slice(end)
      setDraft(next)
      setComposerEmojiOpen(false)
      queueMicrotask(() => {
        ta?.focus()
        const p = start + emoji.length
        ta?.setSelectionRange(p, p)
      })
    },
    [draft],
  )

  const runDeleteMessage = useCallback(
    async (message: DirectMessage) => {
      const cid = conversationId.trim()
      if (!user?.id || !cid || deleteBusy) return
      if (!message?.id || message.id.startsWith('local-')) return
      if (message.senderUserId !== user.id) return
      if (!(message.kind === 'text' || message.kind === 'image' || message.kind === 'audio')) return
      if (!window.confirm('Удалить это сообщение?')) return

      setDeleteBusy(true)
      try {
        const res = await deleteGroupMessage(cid, message.id)
        if (res.error) {
          toast.push({ tone: 'error', message: `Не удалось удалить: ${res.error}`, ms: 2600 })
          return
        }
        setMessages((prev) => {
          const next = prev.filter((m) => {
            if (m.id === message.id) return false
            if (m.kind === 'reaction' && (m.meta?.react_to?.trim() || '') === message.id) return false
            return true
          })
          queueMicrotask(() => onTouchTail?.(messengerConversationListTailPatch(next)))
          return next
        })
      } finally {
        setDeleteBusy(false)
      }
    },
    [conversationId, deleteBusy, toast, user?.id, onTouchTail],
  )

  return (
    <div className="dashboard-messenger__thread-body">
      {threadLoading ? <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" /> : null}

      <div className="dashboard-messenger__scroll-region-wrap">
        <div
          ref={messagesScrollRef}
          className="dashboard-messenger__messages-scroll"
          role="region"
          aria-label="Сообщения группы"
          onScroll={updatePinnedToBottom}
        >
        <div
          ref={groupMessagesContentRef}
          className={`dashboard-messenger__messages${
            viewerOnly && publicJoinCta ? ' dashboard-messenger__messages--public-join-host' : ''
          }`}
        >
          {!canView ? (
            joinRequestPending ? (
              <div className="messenger-join-gate messenger-join-gate--embed">
                <div className="messenger-join-gate__card messenger-join-gate__card--compact">
                  <h2 className="messenger-join-gate__title messenger-join-gate__title--sm">Заявка отправлена</h2>
                  <p className="messenger-join-gate__text">
                    Ожидайте подтверждения от администратора — после одобрения сообщения появятся здесь.
                  </p>
                </div>
              </div>
            ) : (
              <div className="messenger-join-gate messenger-join-gate--embed">
                <div className="messenger-join-gate__card messenger-join-gate__card--compact">
                  <h2 className="messenger-join-gate__title messenger-join-gate__title--sm">Нет доступа</h2>
                  <p className="messenger-join-gate__text">Группа закрыта или у вас нет доступа к переписке.</p>
                </div>
              </div>
            )
          ) : timelineMessages.length === 0 ? (
            viewerOnly && publicJoinCta ? (
              <div className="messenger-viewer-join-empty">
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
              <div className="dashboard-chats-empty">Пока нет сообщений.</div>
            )
          ) : (
            <>
              {(() => {
                const nodes: React.ReactNode[] = []
                let prevDayKey: string | null = null
                for (const m of timelineMessages) {
                  const dt = new Date(m.createdAt)
                  const dayKey = Number.isNaN(dt.getTime()) ? null : `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`
                  if (prevDayKey && dayKey && dayKey !== prevDayKey) {
                    nodes.push(
                      <div key={`${m.id}-day`} className="dashboard-messenger__dm-deleted-plain" aria-hidden>
                        {formatMessengerDaySeparatorLabel(m.createdAt)}
                      </div>,
                    )
                  }
                  if (dayKey) prevDayKey = dayKey

                  const reacts = reactionsByTargetId.get(m.id) ?? []
                  const isOwn = Boolean(user?.id && m.senderUserId === user.id)
                  const { preview: replyPreview, scrollTargetId: replyScrollTargetId } = buildQuotePreview({
                    quotedMessageId: m.quoteToMessageId?.trim() || m.replyToMessageId?.trim() || null,
                    messageById: (id) => timelineMessages.find((x) => x.id === id),
                    resolveQuotedAvatarUrl: () => null,
                    viewerUserId: user?.id ?? null,
                    peerAliasByUserId,
                  })
                  nodes.push(
                    <ThreadMessageBubble
                      key={m.id}
                      message={m}
                      isOwn={isOwn}
                      reactions={reacts}
                      formatDt={formatGroupBubbleTime}
                      replyPreview={replyPreview}
                      replyScrollTargetId={replyScrollTargetId}
                      onReplyQuoteNavigate={scrollToQuotedMessage}
                      bindMessageAnchor={(id, el) => {
                        if (el) messageAnchorRef.current.set(id, el)
                        else messageAnchorRef.current.delete(id)
                      }}
                      currentUserId={user?.id ?? null}
                      onReactionChipTap={(targetId, emoji) => {
                        if (!isAllowedReactionEmoji(emoji)) return
                        void onReactionChipTap(targetId, emoji)
                      }}
                      quickReactEnabled={Boolean(
                        isGroupMember &&
                          user?.id &&
                          (m.kind === 'text' || m.kind === 'image' || m.kind === 'audio') &&
                          !m.id.startsWith('local-'),
                      )}
                      onQuickHeart={() => void toggleReaction(m.id, QUICK_REACTION_EMOJI)}
                      swipeReplyEnabled={isMobileMessenger && isGroupMember}
                      onSwipeReply={() => setReplyTo(m)}
                      menuOpen={messageMenu?.message.id === m.id}
                      onMenuButtonClick={(e) => {
                        e.stopPropagation()
                        if (!isGroupMember || m.id.startsWith('local-')) return
                        const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                        setMessageMenu((cur) => {
                          if (cur?.message.id === m.id) return null
                          return { message: m, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
                        })
                      }}
                      onBubbleContextMenu={(e) => {
                        e.preventDefault()
                        if (!isGroupMember || m.id.startsWith('local-')) return
                        setMessageMenu((cur) => {
                          if (cur?.message.id === m.id) return null
                          return { message: m, anchor: { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY } }
                        })
                      }}
                      onMentionSlug={onMentionSlug}
                      onOpenImageLightbox={(ctx) => setGroupImageLightbox({ urls: ctx.urls, index: ctx.initialIndex })}
                      peerAliasByUserId={peerAliasByUserId}
                      onForwardSourceNavigate={onForwardSourceNavigate}
                    />,
                  )
                }
                return nodes
              })()}
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
          <div ref={groupReadTailRef} className="dashboard-messenger__read-tail-sentinel" aria-hidden />
        </div>
        </div>
        <MessengerJumpToBottomFab visible={showGroupJump} onClick={jumpGroupBottom} />
      </div>

      {isGroupMember ? (
        <div className="dashboard-messenger__composer" role="region" aria-label="Новое сообщение">
          {replyTo ? (
            <div className="dashboard-messenger__composer-reply">
              <div className="dashboard-messenger__composer-reply-text">
                <span className="dashboard-messenger__composer-reply-label">Ответ</span>{' '}
                <strong>
                  {messengerPeerDisplayTitle(
                    replyTo.senderUserId,
                    replyTo.senderNameSnapshot,
                    peerAliasByUserId,
                    user?.id ?? null,
                  )}
                </strong>
                <span className="dashboard-messenger__composer-reply-snippet">
                  <span>
                    {replyTo.kind === 'audio'
                      ? truncateMessengerReplySnippet(replyTo.body, 48) || 'Голосовое сообщение'
                      : truncateMessengerReplySnippet(replyTo.body, 48) || '…'}
                  </span>
                </span>
              </div>
              <button
                type="button"
                className="dashboard-messenger__composer-reply-cancel"
                aria-label="Отменить ответ"
                onClick={() => setReplyTo(null)}
              >
                ✕
              </button>
            </div>
          ) : null}
          {pendingGroupPhotos.length > 0 ? (
            <div className="dashboard-messenger__pending-photos">
              {pendingGroupPhotos.map((p, idx) => (
                <div key={p.id} className="dashboard-messenger__pending-photo">
                  <button
                    type="button"
                    className="dashboard-messenger__pending-photo-open"
                    title="Открыть"
                    aria-label="Открыть изображение"
                    onClick={() =>
                      setGroupImageLightbox({
                        urls: pendingGroupPhotos.map((x) => x.previewUrl),
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
                      removePendingGroupPhoto(p.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <DraftLinkPreviewBar
            preview={draftLinkPreview}
            loading={draftLinkPreviewLoading}
            onDismiss={dismissDraftLinkPreview}
          />
          {showGroupVoiceMetaStrip ? (
            <div
              ref={setVoiceMetaEl}
              className="dashboard-messenger__composer-voice-meta dashboard-messenger__composer-voice-meta--strip"
              aria-live="polite"
            />
          ) : null}
          <div
            className={`dashboard-messenger__composer-main dashboard-messenger__composer-main--row${
              voiceRecording ? ' dashboard-messenger__composer-main--voice-rec-mobile' : ''
            }`}
          >
            <button
              type="button"
              className="dashboard-messenger__composer-icon-btn"
              title="Фото"
              aria-label="Прикрепить фото"
              disabled={threadLoading || photoUploading || voiceUploading}
              onClick={() => photoInputRef.current?.click()}
            >
              <AttachmentIcon />
            </button>
            <div className="dashboard-messenger__composer-input-wrap">
              <MentionAutocomplete
                conversationId={conversationId}
                textareaRef={composerTextareaRef}
                value={draft}
                onChange={setDraft}
                disabled={threadLoading || photoUploading || voiceUploading}
              />
              <textarea
                ref={composerTextareaRef}
                className="dashboard-messenger__input"
                rows={1}
                placeholder="Напиши сообщение…"
                value={draft}
                disabled={threadLoading || photoUploading || voiceUploading}
                onPaste={onComposerPaste}
                onChange={(e) => {
                  setDraft(e.target.value)
                  queueMicrotask(() => adjustMobileComposerHeight())
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void sendText()
                  }
                }}
              />
            </div>
            <div className="dashboard-messenger__composer-trailing">
              <div
                className={`dashboard-messenger__composer-tools${voiceRecording ? ' dashboard-messenger__composer-tools--voice-rec' : ''}`}
                ref={composerEmojiWrapRef}
              >
                {composerEmojiOpen ? (
                  <div className="dashboard-messenger__composer-emoji-pop">
                    <ReactionEmojiPopover
                      title="Эмодзи"
                      emojis={MESSENGER_COMPOSER_EMOJIS}
                      onClose={() => setComposerEmojiOpen(false)}
                      onPick={(em) => insertEmojiInDraft(em)}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  className="dashboard-messenger__composer-icon-btn"
                  title="Эмодзи"
                  aria-label="Вставить эмодзи"
                  disabled={threadLoading}
                  onClick={() => setComposerEmojiOpen((v) => !v)}
                >
                  😀
                </button>
                {showGroupMic ? (
                  <MessengerVoiceRecordBtn
                    variant={isMobileMessenger ? 'mobileEnd' : 'default'}
                    metaPortalEl={isMobileMessenger ? voiceMetaEl : undefined}
                    disabled={threadLoading}
                    busy={photoUploading || voiceUploading || sending}
                    onRecorded={onVoiceRecorded}
                    onRecordingChange={setVoiceRecording}
                  />
                ) : null}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="dashboard-messenger__photo-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    e.target.value = ''
                    if (files.length === 0) return
                    addPendingGroupPhotoFiles(files)
                  }}
                />
              </div>
              {showGroupSendIcon ? (
                <button
                  type="button"
                  className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn dashboard-messenger__send-btn--icon"
                  title="Отправить"
                  aria-label="Отправить сообщение"
                  disabled={groupSendDisabled}
                  onClick={() => void sendText()}
                >
                  <MessengerSendPlaneIcon />
                </button>
              ) : null}
            </div>
          </div>
          {photoUploading || voiceUploading ? (
            <p className="dashboard-messenger__photo-status" role="status">
              {voiceUploading ? 'Загрузка аудио…' : 'Загрузка фото…'}
            </p>
          ) : null}
        </div>
      ) : null}

      {messageMenu
        ? createPortal(
            <div
              ref={messageMenuWrapRef}
              className="messenger-msg-menu-wrap"
              style={{ position: 'fixed', left: 0, top: 0, zIndex: 26500, visibility: 'hidden' }}
            >
              <MessengerMessageMenuPopover
                canEdit={false}
                canCopy={Boolean(
                  !messageMenu.message.id.startsWith('local-') &&
                    (messageMenu.message.kind === 'text' ||
                      messageMenu.message.kind === 'image' ||
                      messageMenu.message.kind === 'audio'),
                )}
                canDelete={Boolean(
                  user?.id &&
                    messageMenu.message.senderUserId === user.id &&
                    !messageMenu.message.id.startsWith('local-') &&
                    (messageMenu.message.kind === 'text' ||
                      messageMenu.message.kind === 'image' ||
                      messageMenu.message.kind === 'audio'),
                )}
                timestampLabel={formatGroupBubbleTime(messageMenu.message.createdAt)}
                onClose={() => setMessageMenu(null)}
                onCopy={async () => {
                  const text = previewTextForDirectMessageTail(messageMenu.message)
                  const ok = await copyTextToClipboard(text)
                  toast.push({
                    tone: ok ? 'success' : 'error',
                    message: ok ? 'Скопировано в буфер обмена' : 'Не удалось скопировать',
                    ms: 2200,
                  })
                }}
                onEdit={() => setMessageMenu(null)}
                onDelete={() => {
                  void runDeleteMessage(messageMenu.message)
                  setMessageMenu(null)
                }}
                onReply={() => {
                  setReplyTo(messageMenu.message)
                  setMessageMenu(null)
                }}
                onPickReaction={(em) => {
                  if (!messageMenu.message.id || !isAllowedReactionEmoji(em)) return
                  void toggleReaction(messageMenu.message.id, em)
                  setMessageMenu(null)
                }}
                onForward={
                  onForwardMessage &&
                  !messageMenu.message.id.startsWith('local-') &&
                  (messageMenu.message.kind === 'text' ||
                    messageMenu.message.kind === 'image' ||
                    messageMenu.message.kind === 'audio')
                    ? () => {
                        onForwardMessage(messageMenu.message)
                        setMessageMenu(null)
                      }
                    : undefined
                }
              />
            </div>,
            document.body,
          )
        : null}

      <MessengerImageLightbox
        open={Boolean(groupImageLightbox && groupImageLightbox.urls.length > 0)}
        urls={groupImageLightbox?.urls ?? []}
        initialIndex={groupImageLightbox?.index ?? 0}
        onClose={() => setGroupImageLightbox(null)}
      />
    </div>
  )
}

