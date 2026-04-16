import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../../utils/popoverOutsideClick'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../hooks/useProfile'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { truncateMessengerReplySnippet } from '../../lib/messengerUi'
import { buildQuotePreview } from '../../lib/messengerQuotePreview'
import { MESSENGER_COMPOSER_EMOJIS } from '../../lib/messengerComposerEmojis'
import { mapDirectMessageFromRow, previewTextForDirectMessageTail, type DirectMessage } from '../../lib/messenger'
import { uploadMessengerImage } from '../../lib/messenger'
import {
  appendGroupMessage,
  deleteGroupMessage,
  listGroupMessagesPage,
  markGroupRead,
  toggleGroupMessageReaction,
  isAllowedReactionEmoji,
} from '../../lib/groups'
import type { ReactionEmoji } from '../../types/roomComms'
import { MessengerMessageMenuPopover } from '../MessengerMessageMenuPopover'
import { AttachmentIcon } from '../icons'
import { ThreadMessageBubble } from './ThreadMessageBubble'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'

const QUICK_REACTION_EMOJI: ReactionEmoji = '❤️'
const GROUP_PHOTO_MAX_BYTES = 2 * 1024 * 1024

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
  onTouchTail,
  onForwardMessage,
  isMemberHint,
  viewerOnly,
  joinRequestPending,
  jumpToMessageId,
  onJumpHandled,
}: {
  conversationId: string
  onTouchTail?: (patch: { lastMessageAt: string; lastMessagePreview: string }) => void
  onForwardMessage?: (message: DirectMessage) => void
  /** Хинт из родителя: если диалог уже есть в списке, считаем что участник (убирает рассинхрон после вступления). */
  isMemberHint?: boolean
  viewerOnly?: boolean
  joinRequestPending?: boolean
  jumpToMessageId?: string | null
  onJumpHandled?: () => void
}) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const toast = useToast()
  const isMobileMessenger = useMediaQuery('(max-width: 900px)')

  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const pinnedToBottomRef = useRef(true)
  const composerEmojiWrapRef = useRef<HTMLDivElement | null>(null)
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  const [messageMenu, setMessageMenu] = useState<{
    message: DirectMessage
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const messageMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const messageAnchorRef = useRef<Map<string, HTMLElement>>(new Map())

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  const [myGroupMemberRole, setMyGroupMemberRole] = useState<string | null>(null)

  const isGroupMember = myGroupMemberRole !== null || isMemberHint === true
  const canView = viewerOnly || isGroupMember

  useEffect(() => {
    let cancelled = false
    const cid = conversationId.trim()
    if (!user?.id || !cid) {
      setMyGroupMemberRole(null)
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
          setMyGroupMemberRole(null)
          return
        }
        const r = typeof (data as { role?: unknown }).role === 'string' ? (data as { role: string }).role.trim() : null
        setMyGroupMemberRole(r)
      })
    return () => {
      cancelled = true
    }
  }, [conversationId, user?.id])

  const removeMessageById = useCallback((messageId: string) => {
    const id = messageId.trim()
    if (!id) return
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

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
    setError(null)
    setMessages([])
    setReplyTo(null)
    void listGroupMessagesPage(cid, { limit: 60 }).then((res) => {
      if (!active) return
      setThreadLoading(false)
      if (res.error) {
        setError(res.error)
        return
      }
      setMessages(res.data ?? [])
      if (!viewerOnly) void markGroupRead(cid)
      pinnedToBottomRef.current = true
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
        composerTextareaRef.current?.focus()
      })
    })
    return () => {
      active = false
    }
  }, [conversationId, user?.id, canView, viewerOnly])

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
    const channel = supabase.channel(`group-thread:${cid}`)
    const filter = `conversation_id=eq.${cid}`

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const msg = mapDirectMessageFromRow(payload.new as Record<string, unknown>)
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
        if (!viewerOnly && document.visibilityState === 'visible') void markGroupRead(cid)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const msg = mapDirectMessageFromRow(payload.new as Record<string, unknown>)
        if (!msg.id) return
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const id = chatMessageDeleteRowId(payload.old as Record<string, unknown>)
        if (!id || cidRef.current.trim() !== cid) return
        removeMessageById(id)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user?.id, onTouchTail, removeMessageById, viewerOnly])

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
      if (viewerOnly || !cid || !uid || !isAllowedReactionEmoji(emoji)) return
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
    [conversationId, toast, user?.id, profile?.display_name, removeMessageById, viewerOnly],
  )

  const onReactionChipTap = useCallback(
    async (targetMessageId: string, emoji: string) => {
      if (!isAllowedReactionEmoji(emoji)) return
      await toggleReaction(targetMessageId, emoji)
    },
    [toggleReaction],
  )

  const sendText = useCallback(async () => {
    const cid = conversationId.trim()
    const body = draft.trim()
    if (viewerOnly || !user?.id || !cid || !body || sending || threadLoading) return
    setSending(true)
    setError(null)
    const replyId = replyTo?.id ?? null
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: profile?.display_name?.trim() || 'Вы',
      kind: 'text',
      body,
      createdAt: new Date().toISOString(),
      replyToMessageId: replyId,
    }
    setMessages((prev) => [...prev, optimistic].sort(sortChrono))
    setDraft('')
    setReplyTo(null)
    const res = await appendGroupMessage(cid, { kind: 'text', body, replyToMessageId: replyId })
    if (res.error) {
      setError(res.error)
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(body)
      setSending(false)
      return
    }
    const finalId = res.data?.messageId ?? optimistic.id
    const finalAt = res.data?.createdAt ?? optimistic.createdAt
    setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...optimistic, id: finalId, createdAt: finalAt } : m)))
    onTouchTail?.({ lastMessageAt: finalAt, lastMessagePreview: body })
    setSending(false)
  }, [conversationId, draft, sending, threadLoading, user?.id, replyTo?.id, profile?.display_name, onTouchTail])

  const sendPhotoFile = useCallback(
    async (file: File) => {
      const cid = conversationId.trim()
      if (viewerOnly || !user?.id || !cid || photoUploading || threadLoading) return
      if (file.size > GROUP_PHOTO_MAX_BYTES) {
        toast.push({
          tone: 'warning',
          title: 'Слишком большой файл',
          message: 'Файл больше 2 МБ. Выберите изображение меньшего размера.',
          ms: 4200,
        })
        return
      }
      setPhotoUploading(true)
      setError(null)
      const up = await uploadMessengerImage(cid, file)
      if (up.error || !up.path) {
        setError(up.error ?? 'upload_failed')
        setPhotoUploading(false)
        return
      }
      const caption = draft.trim()
      const replyId = replyTo?.id ?? null
      const imageMeta = { image: { path: up.path, ...(up.thumbPath ? { thumbPath: up.thumbPath } : {}) } }
      const res = await appendGroupMessage(cid, { kind: 'image', body: caption, meta: imageMeta, replyToMessageId: replyId })
      if (res.error) {
        setError(res.error)
        setPhotoUploading(false)
        return
      }
      const preview = previewTextForDirectMessageTail({ kind: 'image', body: caption, meta: imageMeta })
      const createdAt = res.data?.createdAt ?? new Date().toISOString()
      const snap = profile?.display_name?.trim() || 'Вы'
      const newMsg: DirectMessage = {
        id: res.data?.messageId ?? `local-${Date.now()}`,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'image',
        body: caption,
        createdAt,
        replyToMessageId: replyId,
        meta: imageMeta as any,
      }
      setDraft('')
      setReplyTo(null)
      setPhotoUploading(false)
      setMessages((prev) => [...prev, newMsg].sort(sortChrono))
      onTouchTail?.({ lastMessageAt: createdAt, lastMessagePreview: preview })
    },
    [conversationId, user?.id, photoUploading, threadLoading, draft, replyTo?.id, profile?.display_name, onTouchTail, viewerOnly],
  )

  const onComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (threadLoading || photoUploading) return
      const dt = e.clipboardData
      if (!dt?.items || dt.items.length === 0) return
      let file: File | null = null
      for (const it of Array.from(dt.items)) {
        if (it.kind !== 'file') continue
        if (!it.type || !it.type.startsWith('image/')) continue
        const f = it.getAsFile()
        if (f) {
          file = f
          break
        }
      }
      if (!file) return
      const okTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
      if (file.type && !okTypes.has(file.type)) {
        toast.push({ tone: 'warning', message: 'Формат изображения не поддерживается.', ms: 3200 })
        return
      }
      e.preventDefault()
      void sendPhotoFile(file)
    },
    [photoUploading, sendPhotoFile, threadLoading, toast],
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
      if (!(message.kind === 'text' || message.kind === 'image')) return
      if (!window.confirm('Удалить это сообщение?')) return

      setDeleteBusy(true)
      try {
        const res = await deleteGroupMessage(cid, message.id)
        if (res.error) {
          toast.push({ tone: 'error', message: `Не удалось удалить: ${res.error}`, ms: 2600 })
          return
        }
        setMessages((prev) =>
          prev.filter((m) => {
            if (m.id === message.id) return false
            if (m.kind === 'reaction' && (m.meta?.react_to?.trim() || '') === message.id) return false
            return true
          }),
        )
      } finally {
        setDeleteBusy(false)
      }
    },
    [conversationId, deleteBusy, toast, user?.id],
  )

  return (
    <div className="dashboard-messenger__thread-body">
      {threadLoading ? <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" /> : null}

      <div
        ref={messagesScrollRef}
        className="dashboard-messenger__messages-scroll"
        role="region"
        aria-label="Сообщения группы"
        onScroll={updatePinnedToBottom}
      >
        <div className="dashboard-messenger__messages">
          {!canView ? (
            joinRequestPending ? (
              <div className="dashboard-chats-empty">Запрос на вступление отправлен. Ожидайте подтверждения от администратора.</div>
            ) : (
              <div className="dashboard-chats-empty">Группа закрыта или у вас нет доступа.</div>
            )
          ) : messages.filter((m) => m.kind !== 'reaction').length === 0 ? (
            <div className="dashboard-chats-empty">Пока нет сообщений.</div>
          ) : (
            messages.map((m) => {
              if (m.kind === 'reaction') return null
              const reacts = reactionsByTargetId.get(m.id) ?? []
              const isOwn = Boolean(user?.id && m.senderUserId === user.id)
              const { preview: replyPreview, scrollTargetId: replyScrollTargetId } = buildQuotePreview({
                quotedMessageId: m.quoteToMessageId?.trim() || m.replyToMessageId?.trim() || null,
                messageById: (id) => messages.find((x) => x.id === id),
                resolveQuotedAvatarUrl: () => null,
              })
              return (
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
                    user?.id && (m.kind === 'text' || m.kind === 'image') && !m.id.startsWith('local-'),
                  )}
                  onQuickHeart={() => void toggleReaction(m.id, QUICK_REACTION_EMOJI)}
                  swipeReplyEnabled={isMobileMessenger}
                  onSwipeReply={() => setReplyTo(m)}
                  menuOpen={messageMenu?.message.id === m.id}
                  onMenuButtonClick={(e) => {
                    e.stopPropagation()
                    if (viewerOnly || m.id.startsWith('local-')) return
                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                    setMessageMenu((cur) => {
                      if (cur?.message.id === m.id) return null
                      return { message: m, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
                    })
                  }}
                  onBubbleContextMenu={(e) => {
                    e.preventDefault()
                    if (viewerOnly || m.id.startsWith('local-')) return
                    setMessageMenu((cur) => {
                      if (cur?.message.id === m.id) return null
                      return { message: m, anchor: { left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY } }
                    })
                  }}
                />
              )
            })
          )}
        </div>
      </div>

      {!viewerOnly ? (
        <div className="dashboard-messenger__composer" role="region" aria-label="Новое сообщение">
          {replyTo ? (
            <div className="dashboard-messenger__composer-reply">
              <div className="dashboard-messenger__composer-reply-text">
                <span className="dashboard-messenger__composer-reply-label">Ответ</span>{' '}
                <strong>{replyTo.senderNameSnapshot}</strong>
                <span className="dashboard-messenger__composer-reply-snippet">
                  <span>{truncateMessengerReplySnippet(replyTo.body, 48) || '…'}</span>
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
          <div className="dashboard-messenger__composer-main">
            <textarea
              ref={composerTextareaRef}
              className="dashboard-messenger__input"
              rows={isMobileMessenger ? 1 : 3}
              placeholder="Напиши сообщение…"
              value={draft}
              disabled={threadLoading || photoUploading}
              onPaste={onComposerPaste}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendText()
                }
              }}
            />
            <div className="dashboard-messenger__composer-side">
              <div className="dashboard-messenger__composer-tools" ref={composerEmojiWrapRef}>
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
                <button
                  type="button"
                  className="dashboard-messenger__composer-icon-btn"
                  title="Фото"
                  aria-label="Прикрепить фото"
                  disabled={threadLoading || photoUploading}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <AttachmentIcon />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="dashboard-messenger__photo-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    if (f.size > GROUP_PHOTO_MAX_BYTES) {
                      setError('Файл больше 2 МБ. Выберите изображение меньшего размера.')
                      return
                    }
                    void sendPhotoFile(f)
                  }}
                />
              </div>
              <button
                type="button"
                className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn"
                disabled={!draft.trim() || sending || threadLoading || photoUploading}
                onClick={() => void sendText()}
              >
                Отправить
              </button>
            </div>
          </div>
          {photoUploading ? (
            <p className="dashboard-messenger__photo-status" role="status">
              Загрузка фото…
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
                canDelete={Boolean(
                  user?.id &&
                    messageMenu.message.senderUserId === user.id &&
                    !messageMenu.message.id.startsWith('local-') &&
                    (messageMenu.message.kind === 'text' || messageMenu.message.kind === 'image'),
                )}
                onClose={() => setMessageMenu(null)}
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
                  (messageMenu.message.kind === 'text' || messageMenu.message.kind === 'image')
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
    </div>
  )
}

