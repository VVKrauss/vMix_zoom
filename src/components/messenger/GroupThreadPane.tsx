import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useProfile } from '../../hooks/useProfile'
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
import { FiRrIcon } from '../icons'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'

function sortChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

export function GroupThreadPane({
  conversationId,
  onTouchTail,
}: {
  conversationId: string
  onTouchTail?: (patch: { lastMessageAt: string; lastMessagePreview: string }) => void
}) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const toast = useToast()

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

  const cidRef = useRef(conversationId)
  cidRef.current = conversationId

  useEffect(() => {
    let active = true
    const cid = conversationId.trim()
    if (!user?.id || !cid) return
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
      void markGroupRead(cid)
      requestAnimationFrame(() => composerTextareaRef.current?.focus())
    })
    return () => {
      active = false
    }
  }, [conversationId, user?.id])

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || !user?.id) return
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
        if (document.visibilityState === 'visible') void markGroupRead(cid)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter }, (payload) => {
        const msg = mapDirectMessageFromRow(payload.new as Record<string, unknown>)
        if (!msg.id) return
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user?.id, onTouchTail])

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
      if (!cid || !isAllowedReactionEmoji(emoji)) return
      const res = await toggleGroupMessageReaction(cid, targetMessageId, emoji)
      if (res.error) toast.push({ tone: 'error', message: res.error, ms: 2600 })
    },
    [conversationId, toast],
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
    if (!user?.id || !cid || !body || sending || threadLoading) return
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
      if (!user?.id || !cid || photoUploading || threadLoading) return
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
    [conversationId, user?.id, photoUploading, threadLoading, draft, replyTo?.id, profile?.display_name, onTouchTail],
  )

  return (
    <div className="dashboard-messenger__thread-body">
      {threadLoading ? <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" /> : null}
      {error ? <p className="join-error">{error}</p> : null}

      <div className="dashboard-messenger__messages-scroll" role="region" aria-label="Сообщения группы">
        {messages.filter((m) => m.kind !== 'reaction').length === 0 ? (
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
            return (
              <article key={m.id} className="dashboard-messenger__message">
                {replyTarget ? (
                  <div className="messenger-reply-mini">
                    <span className="messenger-reply-mini__author">{replyTarget.senderNameSnapshot}</span>
                    <span className="messenger-reply-mini__text">{truncateMessengerReplySnippet(replyTarget.body, 42)}</span>
                  </div>
                ) : null}
                <div className="dashboard-messenger__message-body">
                  <MessengerBubbleBody message={m} />
                </div>
                <div className="dashboard-messenger__message-reactions">
                  {rows.map(([emoji, count]) => (
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
                  ))}
                  <button type="button" className="dashboard-messenger__reaction-add" onClick={() => setReactOpenFor(m.id)}>
                    <FiRrIcon name="add" />
                  </button>
                  <button type="button" className="dashboard-messenger__reaction-add" onClick={() => setReplyTo(m)} title="Ответить">
                    <FiRrIcon name="reply" />
                  </button>
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
            <button type="button" className="dashboard-topbar__action" disabled={threadLoading || photoUploading} onClick={() => photoInputRef.current?.click()}>
              <FiRrIcon name="image" />
            </button>
            <button type="button" className="dashboard-topbar__action dashboard-topbar__action--primary" disabled={!draft.trim() || sending || threadLoading} onClick={() => void sendText()}>
              Отправить
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
    </div>
  )
}

