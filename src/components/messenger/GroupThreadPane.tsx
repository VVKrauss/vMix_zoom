import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { shouldClosePopoverOnOutsidePointer } from '../../utils/popoverOutsideClick'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../hooks/useProfile'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { truncateMessengerReplySnippet } from '../../lib/messengerUi'
import { mapDirectMessageFromRow, previewTextForDirectMessageTail, type DirectMessage } from '../../lib/messenger'
import { uploadMessengerImage } from '../../lib/messenger'
import {
  appendGroupMessage,
  listGroupMessagesPage,
  markGroupRead,
  toggleGroupMessageReaction,
  isAllowedReactionEmoji,
} from '../../lib/groups'
import type { ReactionEmoji } from '../../types/roomComms'
import { REACTION_EMOJI_WHITELIST } from '../../types/roomComms'
import { MessengerBubbleBody } from '../MessengerBubbleBody'
import { MessengerMessageMenuPopover } from '../MessengerMessageMenuPopover'
import { FiRrIcon } from '../icons'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'
import { DoubleTapHeartSurface } from './DoubleTapHeartSurface'

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
  onTouchTail,
  onForwardMessage,
  viewerOnly,
  jumpToMessageId,
  onJumpHandled,
}: {
  conversationId: string
  onTouchTail?: (patch: { lastMessageAt: string; lastMessagePreview: string }) => void
  onForwardMessage?: (message: DirectMessage) => void
  viewerOnly?: boolean
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
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  const [reactOpenFor, setReactOpenFor] = useState<string | null>(null)
  const [messageMenu, setMessageMenu] = useState<{
    message: DirectMessage
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  const messageMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const messageAnchorRef = useRef<Map<string, HTMLElement>>(new Map())

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  const [myGroupMemberRole, setMyGroupMemberRole] = useState<string | null>(null)

  const hasAccess = myGroupMemberRole !== null

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
    if (!user?.id || !cid || !hasAccess) return
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
      requestAnimationFrame(() => composerTextareaRef.current?.focus())
    })
    return () => {
      active = false
    }
  }, [conversationId, user?.id, hasAccess, viewerOnly])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !user?.id || !hasAccess) return
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

  return (
    <div className="dashboard-messenger__thread-body">
      {threadLoading ? <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" /> : null}
      {error ? <p className="join-error">{error}</p> : null}

      <div className="dashboard-messenger__messages-scroll" role="region" aria-label="Сообщения группы">
        {!hasAccess ? (
          <div className="dashboard-chats-empty">Группа закрыта или у вас нет доступа.</div>
        ) : messages.filter((m) => m.kind !== 'reaction').length === 0 ? (
          <div className="dashboard-chats-empty">Пока нет сообщений.</div>
        ) : (
          messages.map((m) => {
            if (m.kind === 'reaction') return null
            const reacts = reactionsByTargetId.get(m.id) ?? []
            const counts = new Map<string, number>()
            for (const r of reacts) counts.set(r.body, (counts.get(r.body) ?? 0) + 1)
            const rows = [...counts.entries()]
            const replyId = m.replyToMessageId?.trim() ?? ''
            const replyTarget = replyId ? messages.find((x) => x.id === replyId) ?? null : null
            const isOwn = Boolean(user?.id && m.senderUserId === user.id)
            const menuOpen = messageMenu?.message.id === m.id
            return (
              <article
                key={m.id}
                className={`dashboard-messenger__message${isOwn ? ' dashboard-messenger__message--own' : ''}`}
                ref={(el) => {
                  if (el) messageAnchorRef.current.set(m.id, el)
                  else messageAnchorRef.current.delete(m.id)
                }}
              >
                {replyTarget ? (
                  <div className="messenger-reply-mini">
                    <span className="messenger-reply-mini__author">{replyTarget.senderNameSnapshot}</span>
                    <span className="messenger-reply-mini__text">{truncateMessengerReplySnippet(replyTarget.body, 42)}</span>
                  </div>
                ) : null}
                <div className="dashboard-messenger__message-meta">
                  <div className="dashboard-messenger__message-meta-main">
                    <span className="dashboard-messenger__message-author">{m.senderNameSnapshot}</span>
                    <time dateTime={m.createdAt}>{formatGroupBubbleTime(m.createdAt)}</time>
                    {m.editedAt ? <span className="dashboard-messenger__edited">изм.</span> : null}
                  </div>
                  <button
                    type="button"
                    className={`dashboard-messenger__msg-more${menuOpen ? ' dashboard-messenger__msg-more--open' : ''}`}
                    aria-label="Действия с сообщением"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    disabled={viewerOnly || m.id.startsWith('local-')}
                    onClick={(e) => {
                      const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                      setMessageMenu((cur) => {
                        if (cur?.message.id === m.id) return null
                        return { message: m, anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } }
                      })
                    }}
                  >
                    ⋮
                  </button>
                </div>
                <DoubleTapHeartSurface
                  enabled={Boolean(
                    user?.id && (m.kind === 'text' || m.kind === 'image') && !m.id.startsWith('local-'),
                  )}
                  isMobileViewport={isMobileMessenger}
                  onHeart={() => void toggleReaction(m.id, QUICK_REACTION_EMOJI)}
                >
                  <div className="dashboard-messenger__message-body">
                    <MessengerBubbleBody message={m} />
                  </div>
                </DoubleTapHeartSurface>
                <div className="dashboard-messenger__message-reactions">
                  {!viewerOnly
                    ? rows.map(([emoji, count]) => (
                        <span
                          key={emoji}
                          className={`dashboard-messenger__reaction-chip${
                            user?.id && reacts.some((r) => r.senderUserId === user.id && (r.body.trim() || r.body) === emoji)
                              ? ' dashboard-messenger__reaction-chip--mine'
                              : ''
                          }`}
                          role={
                            user?.id && reacts.some((r) => r.senderUserId === user.id && (r.body.trim() || r.body) === emoji)
                              ? 'button'
                              : undefined
                          }
                          tabIndex={
                            user?.id && reacts.some((r) => r.senderUserId === user.id && (r.body.trim() || r.body) === emoji)
                              ? 0
                              : undefined
                          }
                          onClick={
                            user?.id && reacts.some((r) => r.senderUserId === user.id && (r.body.trim() || r.body) === emoji)
                              ? (e) => {
                                  e.stopPropagation()
                                  void onReactionChipTap(m.id, emoji)
                                }
                              : undefined
                          }
                          onKeyDown={
                            user?.id && reacts.some((r) => r.senderUserId === user.id && (r.body.trim() || r.body) === emoji)
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
                      ))
                    : null}
                  {!viewerOnly ? (
                    <>
                      <button type="button" className="dashboard-messenger__reaction-add" onClick={() => setReactOpenFor(m.id)}>
                        <FiRrIcon name="add" />
                      </button>
                      <button type="button" className="dashboard-messenger__reaction-add" onClick={() => setReplyTo(m)} title="Ответить">
                        <FiRrIcon name="reply" />
                      </button>
                    </>
                  ) : null}
                </div>
              </article>
            )
          })
        )}
      </div>

      {replyTo ? (
        <div className="messenger-reply-banner">
          <span className="messenger-reply-banner__title">Ответ</span>
          <span className="messenger-reply-banner__text">
            {replyTo.senderNameSnapshot}: {truncateMessengerReplySnippet(replyTo.body, 48)}
          </span>
          <button type="button" className="messenger-reply-banner__close" onClick={() => setReplyTo(null)} aria-label="Отменить ответ">
            ×
          </button>
        </div>
      ) : null}

      {!viewerOnly ? (
        <div className="dashboard-messenger__composer" role="region" aria-label="Новое сообщение">
          <div className="dashboard-messenger__composer-main">
            <textarea
              ref={composerTextareaRef}
              className="dashboard-messenger__input"
              rows={2}
              placeholder="Сообщение…"
              value={draft}
              disabled={threadLoading}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void sendText()
                }
              }}
            />
            <div className="dashboard-messenger__composer-side">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  e.target.value = ''
                  void sendPhotoFile(f)
                }}
              />
              <button
                type="button"
                className="dashboard-topbar__action"
                disabled={threadLoading || photoUploading}
                onClick={() => photoInputRef.current?.click()}
              >
                <FiRrIcon name="image" />
              </button>
              <button
                type="button"
                className="dashboard-topbar__action dashboard-topbar__action--primary"
                disabled={!draft.trim() || sending || threadLoading}
                onClick={() => void sendText()}
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reactOpenFor ? (
        <div className="confirm-dialog-root">
          <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={() => setReactOpenFor(null)} />
          <div className="confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <ReactionEmojiPopover
              title="Реакция"
              emojis={REACTION_EMOJI_WHITELIST}
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

      {messageMenu
        ? createPortal(
            <div
              ref={messageMenuWrapRef}
              className="messenger-msg-menu-wrap"
              style={{ position: 'fixed', left: 0, top: 0, zIndex: 26500, visibility: 'hidden' }}
            >
              <MessengerMessageMenuPopover
                canEdit={false}
                canDelete={false}
                onClose={() => setMessageMenu(null)}
                onEdit={() => setMessageMenu(null)}
                onDelete={() => setMessageMenu(null)}
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

