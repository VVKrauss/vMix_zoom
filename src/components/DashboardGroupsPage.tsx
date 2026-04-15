import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useProfile } from '../hooks/useProfile'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { truncateMessengerReplySnippet } from '../lib/messengerUi'
import { MessengerBubbleBody } from './MessengerBubbleBody'
import { BrandLogoLoader } from './BrandLogoLoader'
import { ChevronLeftIcon, FiRrIcon } from './icons'
import { DashboardShell } from './DashboardShell'
import { ReactionEmojiPopover } from './ReactionEmojiPopover'
import type { ReactionEmoji } from '../types/roomComms'
import { mapDirectMessageFromRow, previewTextForDirectMessageTail, type DirectMessage } from '../lib/messenger'
import { uploadMessengerImage } from '../lib/messenger'
import {
  appendGroupMessage,
  createGroupChat,
  isAllowedReactionEmoji,
  listGroupMessagesPage,
  listMyGroupChats,
  markGroupRead,
  toggleGroupMessageReaction,
  type GroupChatSummary,
} from '../lib/groups'

function sortChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

function normalizeSearch(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function DashboardGroupsPage() {
  const { signOut, user } = useAuth()
  const { profile } = useProfile()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const toast = useToast()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const groupIdFromUrl = sp.get('group')?.trim() ?? ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<GroupChatSummary[]>([])
  const [search, setSearch] = useState('')

  const [activeId, setActiveId] = useState('')
  const activeIdRef = useRef('')
  activeIdRef.current = activeId

  const [threadLoading, setThreadLoading] = useState(false)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoInputRef = useRef<HTMLInputElement | null>(null)

  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  const [reactOpenFor, setReactOpenFor] = useState<string | null>(null)

  const refreshList = useCallback(async () => {
    if (!user?.id) return
    const res = await listMyGroupChats()
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
    void listMyGroupChats().then((res) => {
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
    const want = groupIdFromUrl || activeIdRef.current
    if (want && items.some((g) => g.id === want)) {
      setActiveId(want)
      return
    }
    setActiveId(items[0]!.id)
  }, [groupIdFromUrl, items])

  const filtered = useMemo(() => {
    const n = normalizeSearch(search)
    if (!n) return items
    return items.filter((c) => (c.title ?? '').toLowerCase().includes(n) || (c.lastMessagePreview ?? '').toLowerCase().includes(n))
  }, [items, search])

  const activeGroup = useMemo(() => items.find((c) => c.id === activeId) ?? null, [items, activeId])

  const loadThread = useCallback(async (gid: string) => {
    if (!gid) return
    setThreadLoading(true)
    setMessages([])
    setHasMoreOlder(false)
    setReplyTo(null)
    try {
      const res = await listGroupMessagesPage(gid, { limit: 60 })
      if (activeIdRef.current !== gid) return
      if (res.error) {
        setError(res.error)
        return
      }
      setError(null)
      setMessages(res.data ?? [])
      setHasMoreOlder(res.hasMoreOlder)
      void markGroupRead(gid)
      setItems((prev) => prev.map((it) => (it.id === gid ? { ...it, unreadCount: 0 } : it)))
      requestAnimationFrame(() => composerTextareaRef.current?.focus())
    } finally {
      if (activeIdRef.current === gid) setThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!activeId) return
    void loadThread(activeId)
  }, [activeId, loadThread])

  useEffect(() => {
    if (!activeId || !user?.id) return

    const channel = supabase.channel(`groups:${activeId}`)
    const filter = `conversation_id=eq.${activeId}`

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const msg = mapDirectMessageFromRow(row)
          if (!msg.id) return
          // Своих реакций у нас нет optimistic-ветки, поэтому их тоже принимаем.
          if (msg.senderUserId === user.id && msg.kind !== 'reaction') return

          const gid = activeIdRef.current
          if (!gid) return

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            return [...prev, msg].sort(sortChrono)
          })

          const preview = previewTextForDirectMessageTail(msg)
          setItems((prev) =>
            prev.map((it) =>
              it.id === gid
                ? {
                    ...it,
                    lastMessageAt: msg.createdAt,
                    lastMessagePreview: preview,
                    messageCount: it.messageCount + 1,
                    unreadCount: it.unreadCount + (document.visibilityState === 'visible' ? 0 : 1),
                  }
                : it,
            ),
          )

          if (document.visibilityState === 'visible') void markGroupRead(gid)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const msg = mapDirectMessageFromRow(row)
          if (!msg.id) return
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeId, user?.id])

  const loadOlder = useCallback(async () => {
    if (!activeId || loadingOlder || !hasMoreOlder) return
    const oldest = messages[0]
    if (!oldest?.id) return
    setLoadingOlder(true)
    try {
      const res = await listGroupMessagesPage(activeId, { limit: 60, before: { createdAt: oldest.createdAt, id: oldest.id } })
      if (res.error) {
        setError(res.error)
        return
      }
      setHasMoreOlder(res.hasMoreOlder)
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        const merged = [...(res.data ?? []).filter((m) => !seen.has(m.id)), ...prev]
        merged.sort(sortChrono)
        return merged
      })
    } finally {
      setLoadingOlder(false)
    }
  }, [activeId, loadingOlder, hasMoreOlder, messages])

  const openGroup = (gid: string) => {
    navigate(`/dashboard/groups?group=${encodeURIComponent(gid)}`)
    setActiveId(gid)
  }

  const createGroup = useCallback(async () => {
    const title = window.prompt('Название группы?')?.trim() ?? ''
    if (!title) return
    const isPublic = window.confirm('Сделать группу публичной? (Да = публичная, Отмена = по приглашению)')
    const res = await createGroupChat(title, isPublic)
    if (res.error || !res.data) {
      toast.push({ tone: 'error', message: res.error ?? 'Не удалось создать группу.', ms: 3200 })
      return
    }
    await refreshList()
    openGroup(res.data)
  }, [toast, refreshList])

  const sendText = useCallback(async () => {
    const gid = activeId.trim()
    const trimmed = draft.trim()
    if (!user?.id || !gid || !trimmed || sending || threadLoading) return
    setSending(true)
    setError(null)

    const replyId = replyTo?.id ?? null
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: profile?.display_name?.trim() || 'Вы',
      kind: 'text',
      body: trimmed,
      createdAt: new Date().toISOString(),
      replyToMessageId: replyId,
    }
    setMessages((prev) => [...prev, optimistic].sort(sortChrono))
    setDraft('')
    setReplyTo(null)

    const res = await appendGroupMessage(gid, { kind: 'text', body: trimmed, replyToMessageId: replyId })
    if (res.error) {
      setError(res.error)
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(trimmed)
      setSending(false)
      queueMicrotask(() => composerTextareaRef.current?.focus())
      return
    }

    const finalId = res.data?.messageId ?? optimistic.id
    const finalAt = res.data?.createdAt ?? optimistic.createdAt
    setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? { ...optimistic, id: finalId, createdAt: finalAt } : m)))
    setItems((prev) =>
      prev.map((it) =>
        it.id === gid
          ? { ...it, lastMessageAt: finalAt, lastMessagePreview: trimmed, messageCount: it.messageCount + 1, unreadCount: 0 }
          : it,
      ),
    )
    setSending(false)
    requestAnimationFrame(() => composerTextareaRef.current?.focus())
  }, [activeId, draft, sending, threadLoading, user?.id, replyTo?.id, profile?.display_name, refreshList])

  const sendPhotoFile = useCallback(
    async (file: File) => {
      const gid = activeId.trim()
      if (!user?.id || !gid || photoUploading || threadLoading) return
      setPhotoUploading(true)
      setError(null)
      const up = await uploadMessengerImage(gid, file)
      if (up.error || !up.path) {
        setError(up.error ?? 'upload_failed')
        setPhotoUploading(false)
        return
      }
      const caption = draft.trim()
      const replyId = replyTo?.id ?? null
      const imageMeta = { image: { path: up.path, ...(up.thumbPath ? { thumbPath: up.thumbPath } : {}) } }
      const res = await appendGroupMessage(gid, { kind: 'image', body: caption, meta: imageMeta, replyToMessageId: replyId })
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
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev
        return [...prev, newMsg].sort(sortChrono)
      })
      setItems((prev) =>
        prev.map((it) =>
          it.id === gid
            ? { ...it, lastMessageAt: createdAt, lastMessagePreview: preview, messageCount: it.messageCount + 1, unreadCount: 0 }
            : it,
        ),
      )
    },
    [activeId, user?.id, photoUploading, threadLoading, draft, replyTo?.id, profile?.display_name],
  )

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
      const gid = activeId.trim()
      if (!gid || !isAllowedReactionEmoji(emoji)) return
      const res = await toggleGroupMessageReaction(gid, targetMessageId, emoji)
      if (res.error || !res.data) {
        toast.push({ tone: 'error', message: res.error ?? 'Не удалось поставить реакцию.', ms: 2800 })
        return
      }
    },
    [activeId, toast],
  )

  const renderMessage = (m: DirectMessage) => {
    if (m.kind === 'reaction') return null
    const reacts = reactionsByTargetId.get(m.id) ?? []
    const counts = new Map<string, number>()
    for (const r of reacts) counts.set(r.body, (counts.get(r.body) ?? 0) + 1)
    const rows = [...counts.entries()]
    const replyId = m.replyToMessageId?.trim() ?? ''
    const replyTarget = replyId ? messages.find((x) => x.id === replyId) ?? null : null
    const isMine = user?.id && m.senderUserId === user.id
    return (
      <article
        key={m.id}
        className={`dashboard-messenger__message${isMine ? ' dashboard-messenger__message--mine' : ''}`}
        onDoubleClick={() => setReplyTo(m)}
      >
        <div className="dashboard-messenger__message-meta">
          <div className="dashboard-messenger__message-meta-main">
            <span className="dashboard-messenger__message-author">{m.senderNameSnapshot}</span>
            <time className="dashboard-messenger__message-time" dateTime={m.createdAt}>
              {new Date(m.createdAt).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
        </div>
        {replyTarget ? (
          <button
            type="button"
            className="messenger-reply-mini"
            onClick={() => toast.push({ tone: 'info', message: 'Прыжок к сообщению (пока не реализовано).', ms: 2000 })}
          >
            <span className="messenger-reply-mini__author">{replyTarget.senderNameSnapshot}</span>
            <span className="messenger-reply-mini__text">{truncateMessengerReplySnippet(replyTarget.body, 42)}</span>
          </button>
        ) : null}
        <div className="dashboard-messenger__message-body">
          <MessengerBubbleBody message={m} />
        </div>
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
          <button type="button" className="dashboard-messenger__reaction-add" onClick={() => setReplyTo(m)} title="Ответить">
            <FiRrIcon name="reply" />
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
          <aside className="dashboard-messenger__list" aria-label="Список групп">
            <header className="dashboard-messenger__list-head">
              <Link to="/dashboard" className="dashboard-messenger__list-head-back" title="Назад" aria-label="Назад">
                <ChevronLeftIcon />
              </Link>
              <input
                type="search"
                className="dashboard-messenger__list-head-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по группам…"
                autoComplete="off"
              />
              <div className="dashboard-messenger__list-head-actions">
                <button type="button" className="dashboard-messenger__list-head-btn dashboard-messenger__list-head-btn--primary" onClick={() => void createGroup()} title="Создать">
                  <FiRrIcon name="add" />
                </button>
                <button type="button" className="dashboard-messenger__list-head-btn" onClick={() => void refreshList()} title="Обновить">
                  <FiRrIcon name="refresh" />
                </button>
              </div>
            </header>

            <div className="dashboard-messenger__list-scroll">
              {loading ? (
                <div className="dashboard-messenger__pane-loader" aria-label="Загрузка списка…">
                  <BrandLogoLoader size={56} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="dashboard-chats-empty">Групп пока нет.</div>
              ) : (
                filtered.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`dashboard-messenger__row${g.id === activeId ? ' dashboard-messenger__row--active' : ''}`}
                    onClick={() => openGroup(g.id)}
                  >
                    <div className="dashboard-messenger__row-main">
                      <span className="dashboard-messenger__row-avatar" aria-hidden>
                        <span>{(g.title.trim().charAt(0) || 'Г').toUpperCase()}</span>
                      </span>
                      <div className="dashboard-messenger__row-content">
                        <div className="dashboard-messenger__row-titleline">
                          <div className="dashboard-messenger__row-title">{g.title}</div>
                          <div className="dashboard-messenger__row-aside">
                            {g.unreadCount > 0 ? (
                              <span className="dashboard-messenger__row-badge">{g.unreadCount > 99 ? '99+' : g.unreadCount}</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="dashboard-messenger__row-preview">{g.lastMessagePreview?.trim() || 'Пока без сообщений'}</div>
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
            ) : !activeGroup ? (
              <div className="dashboard-chats-empty">Выберите группу слева.</div>
            ) : (
              <>
                <div className="dashboard-messenger__thread-head">
                  <div className="dashboard-messenger__thread-head-desktop">
                    <h3 className="dashboard-section__subtitle">{activeGroup.title}</h3>
                    <span className="dashboard-messenger__thread-head-sub">
                      {activeGroup.isPublic ? 'Публичная' : 'По приглашению'}
                    </span>
                  </div>
                </div>

                <div className="dashboard-messenger__messages-scroll" role="region" aria-label="Сообщения группы">
                  {hasMoreOlder ? (
                    <div style={{ padding: 10, textAlign: 'center' }}>
                      <button type="button" className="dashboard-topbar__action" disabled={loadingOlder} onClick={() => void loadOlder()}>
                        {loadingOlder ? 'Загрузка…' : 'Показать старше'}
                      </button>
                    </div>
                  ) : null}

                  {messages.filter((m) => m.kind !== 'reaction').length === 0 ? (
                    <div className="dashboard-chats-empty">Пока нет сообщений.</div>
                  ) : (
                    messages.map((m) => renderMessage(m))
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
                      <button
                        type="button"
                        className="dashboard-topbar__action"
                        disabled={threadLoading || photoUploading}
                        onClick={() => photoInputRef.current?.click()}
                        title="Фото"
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

