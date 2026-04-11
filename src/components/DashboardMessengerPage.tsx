import type { MouseEvent } from 'react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useProfile } from '../hooks/useProfile'
import {
  appendDirectMessage,
  type DirectConversationSummary,
  type DirectMessage,
  ensureDirectConversationWithUser,
  ensureSelfDirectConversation,
  getDirectConversationForUser,
  isDirectReactionEmoji,
  listDirectConversationsForUser,
  listDirectMessagesPage,
  mapDirectMessageFromRow,
  markDirectConversationRead,
  requestMessengerUnreadRefresh,
  toggleDirectMessageReaction,
} from '../lib/messenger'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { supabase } from '../lib/supabase'
import { newRoomId } from '../utils/roomId'
import { BrandLogoLoader } from './BrandLogoLoader'
import {
  AdminPanelIcon,
  ChatBubbleIcon,
  DashboardIcon,
  MenuBurgerIcon,
  ParticipantsBadgeIcon,
  RoomsIcon,
} from './icons'
import { DashboardShell } from './DashboardShell'
import { ThemeToggle } from './ThemeToggle'
import { MessengerMessageBody } from './MessengerMessageBody'
import { ReactionEmojiPopover } from './ReactionEmojiPopover'
import type { ReactionEmoji } from '../types/roomComms'

function formatDateTime(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function conversationInitial(title: string): string {
  return (title.trim().charAt(0) || 'С').toUpperCase()
}

const MESSENGER_LAST_OPEN_KEY = 'vmix.messenger.lastOpenConversation'
const DM_PAGE_SIZE = 50

const MESSENGER_LIKE_EMOJI: ReactionEmoji = '👍'

function sortDirectMessagesChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

function sortConversationsByActivity(list: DirectConversationSummary[]): DirectConversationSummary[] {
  return [...list].sort((a, b) => {
    const aTs = new Date(a.lastMessageAt ?? a.createdAt).getTime()
    const bTs = new Date(b.lastMessageAt ?? b.createdAt).getTime()
    return bTs - aTs
  })
}

/** Последнее text/system в треде — для превью в списке (реакции не считаются «последним сообщением»). */
function lastNonReactionBody(rows: DirectMessage[]): string | null {
  const sorted = [...rows].sort(sortDirectMessagesChrono)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i]!
    if (m.kind === 'text' || m.kind === 'system') return m.body
  }
  return null
}

/** URL пустой: последний открытый диалог из localStorage, иначе самый свежий по активности, иначе запасной id (напр. «с собой»). */
function pickDefaultConversationId(
  list: DirectConversationSummary[],
  fallbackId: string | null,
): string {
  if (list.length === 0) return fallbackId?.trim() || ''
  try {
    const stored = localStorage.getItem(MESSENGER_LAST_OPEN_KEY)?.trim()
    if (stored && list.some((i) => i.id === stored)) return stored
  } catch {
    /* ignore */
  }
  const sorted = sortConversationsByActivity(list)
  return sorted[0]?.id || fallbackId?.trim() || ''
}

export function DashboardMessengerPage() {
  const { conversationId: rawConversationId } = useParams<{ conversationId?: string }>()
  const routeConversationId = rawConversationId?.trim() ?? ''
  const [searchParams] = useSearchParams()
  const searchConversationId = searchParams.get('chat')?.trim() ?? ''
  const conversationId = searchConversationId || routeConversationId
  const targetUserId = searchParams.get('with')?.trim() ?? ''
  const targetTitle = searchParams.get('title')?.trim() ?? ''
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { profile } = useProfile()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const isMobileMessenger = useMediaQuery('(max-width: 900px)')
  const headerMessengerUnread = useMessengerUnreadCount()
  const [messengerMenuOpen, setMessengerMenuOpen] = useState(false)
  /** Мобильный режим «только дерево чатов» — не подставлять chat в URL и не грузить тред */
  const listOnlyMobile = isMobileMessenger && searchParams.get('view') === 'list'

  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<DirectConversationSummary[]>([])
  const [activeConversation, setActiveConversation] = useState<DirectConversationSummary | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [reactionPick, setReactionPick] = useState<{
    messageId: string
    clientX: number
    clientY: number
  } | null>(null)
  /** Снятие реакции уже отразили в списке диалогов после RPC — пропускаем дубль из realtime DELETE. */
  const reactionDeleteSidebarSyncedRef = useRef(new Set<string>())

  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId
  const itemsRef = useRef(items)
  itemsRef.current = items
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const olderFetchInFlightRef = useRef(false)
  const prevThreadIdForClearRef = useRef<string | null>(null)
  const prevMessagesLenForScrollRef = useRef(0)
  /** Уже загруженные сообщения для этого id — не дергать API при повторном срабатывании эффекта (напр. loading). */
  const lastFetchedThreadIdRef = useRef<string | null>(null)
  /** После первой успешной загрузки списка — повторный bootstrap при «Назад к чатам» не нужен */
  const listLoadedOnceRef = useRef(false)

  const buildMessengerUrl = (chatId?: string, withUserId?: string, withTitle?: string) => {
    const params = new URLSearchParams()
    if (chatId) params.set('chat', chatId)
    if (withUserId) params.set('with', withUserId)
    if (withTitle) params.set('title', withTitle)
    const qs = params.toString()
    return qs ? `/dashboard/messenger?${qs}` : '/dashboard/messenger'
  }

  const selectConversation = (nextConversationId: string) => {
    navigate(buildMessengerUrl(nextConversationId), { replace: false })
  }

  useEffect(() => {
    if (!routeConversationId || searchConversationId) return
    navigate(buildMessengerUrl(routeConversationId, targetUserId || undefined, targetTitle || undefined), {
      replace: true,
    })
  }, [navigate, routeConversationId, searchConversationId, targetTitle, targetUserId])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!user?.id) {
        listLoadedOnceRef.current = false
        lastFetchedThreadIdRef.current = null
        prevThreadIdForClearRef.current = null
        if (active) {
          setItems([])
          setActiveConversation(null)
          setMessages([])
          setLoading(false)
        }
        return
      }

      const treeOnlyReturn =
        isMobileMessenger && searchParams.get('view') === 'list' && listLoadedOnceRef.current
      if (treeOnlyReturn) {
        if (active) {
          setLoading(false)
          setError(null)
        }
        return
      }

      if (!listLoadedOnceRef.current || Boolean(targetUserId?.trim())) {
        setLoading(true)
      }
      setError(null)

      const ensured = targetUserId
        ? await ensureDirectConversationWithUser(targetUserId, targetTitle || null)
        : await ensureSelfDirectConversation()

      if (!active) return
      if (ensured.error) {
        setError(ensured.error)
        setLoading(false)
        return
      }

      const listRes = await listDirectConversationsForUser()
      if (!active) return
      if (listRes.error) {
        setError(listRes.error)
        setItems([])
        setLoading(false)
        return
      }

      const nextItems = listRes.data ?? []
      setItems(nextItems)
      listLoadedOnceRef.current = true

      const fromUrl = conversationIdRef.current.trim()
      const forTargetUser =
        targetUserId.trim() && typeof ensured.data === 'string' && ensured.data.trim() ? ensured.data.trim() : ''
      const targetConversationId =
        fromUrl ||
        forTargetUser ||
        pickDefaultConversationId(nextItems, ensured.data) ||
        ''

      const viewAtNavigate = new URLSearchParams(window.location.search).get('view')
      const viewListOnly = isMobileMessenger && viewAtNavigate === 'list'
      if (!conversationIdRef.current.trim() && targetConversationId && !viewListOnly) {
        navigate(buildMessengerUrl(targetConversationId, targetUserId || undefined, targetTitle || undefined), {
          replace: true,
        })
      }

      if (!targetConversationId) {
        setActiveConversation(null)
        setMessages([])
        setLoading(false)
        return
      }

      setLoading(false)
    }

    void run()
    return () => {
      active = false
    }
  }, [isMobileMessenger, navigate, searchConversationId, searchParams, targetTitle, targetUserId, user?.id])

  useEffect(() => {
    const run = async () => {
      if (!user?.id || loading) return
      if (listOnlyMobile) {
        lastFetchedThreadIdRef.current = null
        setThreadLoading(false)
        setActiveConversation(null)
        setMessages([])
        setHasMoreOlder(false)
        return
      }
      const startedTarget =
        conversationId.trim() || pickDefaultConversationId(itemsRef.current, null) || ''
      if (!startedTarget) {
        lastFetchedThreadIdRef.current = null
        setActiveConversation(null)
        setMessages([])
        setHasMoreOlder(false)
        setThreadLoading(false)
        return
      }

      const prevOpenedId = prevThreadIdForClearRef.current
      const conversationSwitched = prevOpenedId !== startedTarget
      if (conversationSwitched) {
        prevThreadIdForClearRef.current = startedTarget
        lastFetchedThreadIdRef.current = null
        setMessages([])
        setHasMoreOlder(false)
      }

      if (lastFetchedThreadIdRef.current === startedTarget) {
        void markDirectConversationRead(startedTarget)
        setItems((prev) =>
          prev.map((item) =>
            item.id === startedTarget ? { ...item, unreadCount: 0 } : item,
          ),
        )
        setActiveConversation((prev) =>
          prev && prev.id === startedTarget ? { ...prev, unreadCount: 0 } : prev,
        )
        requestMessengerUnreadRefresh()
        setThreadLoading(false)
        return
      }

      setThreadLoading(true)

      try {
        const [conversationRes, messagesRes] = await Promise.all([
          getDirectConversationForUser(startedTarget),
          listDirectMessagesPage(startedTarget, { limit: DM_PAGE_SIZE }),
        ])

        const wantNow =
          conversationIdRef.current.trim() || pickDefaultConversationId(itemsRef.current, null) || ''
        if (wantNow !== startedTarget) return

        if (conversationRes.error) {
          setError(conversationRes.error)
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else if (!conversationRes.data) {
          setError('Чат не найден или у вас нет к нему доступа.')
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else if (messagesRes.error) {
          setError(messagesRes.error)
          setActiveConversation(
            conversationRes.data ? { ...conversationRes.data, unreadCount: 0 } : null,
          )
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else {
          setActiveConversation({ ...conversationRes.data, unreadCount: 0 })
          setMessages(messagesRes.data ?? [])
          setHasMoreOlder(messagesRes.hasMoreOlder)
          lastFetchedThreadIdRef.current = startedTarget
          setItems((prev) =>
            prev.map((item) =>
              item.id === startedTarget ? { ...item, unreadCount: 0 } : item,
            ),
          )
          requestMessengerUnreadRefresh()
        }
      } finally {
        setThreadLoading(false)
      }
    }

    void run()
  }, [conversationId, listOnlyMobile, loading, user?.id])

  const activeConversationId = listOnlyMobile ? '' : conversationId || activeConversation?.id || ''

  useEffect(() => {
    if (listOnlyMobile || !activeConversationId) return
    try {
      localStorage.setItem(MESSENGER_LAST_OPEN_KEY, activeConversationId)
    } catch {
      /* ignore */
    }
  }, [activeConversationId, listOnlyMobile])

  /**
   * Сразу при открытии треда: сервер «прочитано» + нулим бейдж в списке и шапке.
   * Зависит от `items`, чтобы сработать, когда список диалогов только подгрузился; если непрочитанных уже 0 — не дёргаем RPC.
   */
  useEffect(() => {
    if (!user?.id || listOnlyMobile) return
    const cid = conversationId.trim()
    if (!cid) return
    const row = items.find((i) => i.id === cid)
    if (row && row.unreadCount === 0) return

    void markDirectConversationRead(cid)
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.id === cid)
      if (idx === -1) return prev
      if (prev[idx]!.unreadCount === 0) return prev
      return prev.map((item) => (item.id === cid ? { ...item, unreadCount: 0 } : item))
    })
    setActiveConversation((prev) => {
      if (!prev || prev.id !== cid) return prev
      if (prev.unreadCount === 0) return prev
      return { ...prev, unreadCount: 0 }
    })
    if (!row || row.unreadCount > 0) requestMessengerUnreadRefresh()
  }, [conversationId, listOnlyMobile, user?.id, items])

  const showListPane = !isMobileMessenger || !activeConversationId
  const showThreadPane = !isMobileMessenger || Boolean(activeConversationId)

  /** Новые сообщения в открытом треде без полной перезагрузки списка */
  useEffect(() => {
    const uid = user?.id
    const convId = activeConversationId
    if (!uid || !convId || listOnlyMobile) return

    const bumpSidebarForInsert = (msg: DirectMessage) => {
      if (msg.kind === 'reaction') {
        setItems((prev) =>
          prev.map((item) =>
            item.id === convId
              ? {
                  ...item,
                  lastMessageAt: msg.createdAt,
                  messageCount: item.messageCount + 1,
                  unreadCount: 0,
                }
              : item,
          ),
        )
        setActiveConversation((prev) =>
          prev && prev.id === convId
            ? {
                ...prev,
                lastMessageAt: msg.createdAt,
                messageCount: prev.messageCount + 1,
                unreadCount: 0,
              }
            : prev,
        )
        return
      }
      const preview = msg.body
      setItems((prev) =>
        prev.map((item) =>
          item.id === convId
            ? {
                ...item,
                lastMessageAt: msg.createdAt,
                lastMessagePreview: preview,
                messageCount: item.messageCount + 1,
                unreadCount: 0,
              }
            : item,
        ),
      )
      setActiveConversation((prev) =>
        prev && prev.id === convId
          ? {
              ...prev,
              lastMessageAt: msg.createdAt,
              lastMessagePreview: preview,
              messageCount: prev.messageCount + 1,
              unreadCount: 0,
            }
          : prev,
      )
    }

    const channel = supabase
      .channel(`dm-thread:${convId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id) return
          const msg = mapDirectMessageFromRow(row)
          const isOwn = msg.senderUserId === uid
          const skipSidebarBump = isOwn && (msg.kind === 'text' || msg.kind === 'reaction')

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            let base = prev
            if (isOwn) {
              const i = prev.findIndex(
                (m) =>
                  m.id.startsWith('local-') &&
                  m.senderUserId === msg.senderUserId &&
                  m.body === msg.body &&
                  m.kind === msg.kind &&
                  (m.meta?.react_to ?? '') === (msg.meta?.react_to ?? ''),
              )
              if (i !== -1) base = [...prev.slice(0, i), ...prev.slice(i + 1)]
            }
            const next = [...base, msg]
            next.sort(sortDirectMessagesChrono)
            return next
          })

          if (!skipSidebarBump) bumpSidebarForInsert(msg)
          /* Пока тред открыт: входящие от других не должны увеличивать непрочитанные (сервер + бейдж в шапке). */
          if (!isOwn) {
            void markDirectConversationRead(convId)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const oldRow = payload.old as Record<string, unknown>
          const id = typeof oldRow?.id === 'string' ? oldRow.id : ''
          if (!id) return

          setMessages((prev) => prev.filter((m) => m.id !== id))

          if (reactionDeleteSidebarSyncedRef.current.has(id)) {
            reactionDeleteSidebarSyncedRef.current.delete(id)
            return
          }

          setItems((prev) =>
            prev.map((item) =>
              item.id === convId
                ? { ...item, messageCount: Math.max(0, item.messageCount - 1) }
                : item,
            ),
          )
          setActiveConversation((prev) =>
            prev && prev.id === convId
              ? { ...prev, messageCount: Math.max(0, prev.messageCount - 1) }
              : prev,
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeConversationId, listOnlyMobile, user?.id])

  const prevThreadLoadingRef = useRef(false)
  useLayoutEffect(() => {
    const wasLoading = prevThreadLoadingRef.current
    prevThreadLoadingRef.current = threadLoading
    if (wasLoading && !threadLoading && !listOnlyMobile && messages.length > 0) {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, [threadLoading, listOnlyMobile, messages.length])

  const loadOlderMessages = useCallback(async () => {
    const convId = listOnlyMobile ? '' : conversationId.trim()
    const conv = convId || activeConversation?.id || ''
    if (!conv || loadingOlder || !hasMoreOlder || olderFetchInFlightRef.current) return
    const oldest = messages[0]
    if (!oldest?.id || oldest.id.startsWith('local-')) return

    const scrollEl = messagesScrollRef.current
    const prevScrollHeight = scrollEl?.scrollHeight ?? 0
    const prevScrollTop = scrollEl?.scrollTop ?? 0

    olderFetchInFlightRef.current = true
    setLoadingOlder(true)
    try {
      const res = await listDirectMessagesPage(conv, {
        limit: DM_PAGE_SIZE,
        before: { createdAt: oldest.createdAt, id: oldest.id },
      })
      if (res.error) {
        setError(res.error)
        return
      }
      const older = res.data ?? []
      if (older.length === 0) {
        setHasMoreOlder(false)
        return
      }
      setHasMoreOlder(res.hasMoreOlder)
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        const merged = [...older.filter((m) => !seen.has(m.id)), ...prev]
        merged.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
            a.id.localeCompare(b.id),
        )
        return merged
      })
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop
      })
    } finally {
      olderFetchInFlightRef.current = false
      setLoadingOlder(false)
    }
  }, [
    activeConversation?.id,
    conversationId,
    hasMoreOlder,
    listOnlyMobile,
    loadingOlder,
    messages,
  ])

  const lastOlderScrollInvokeRef = useRef(0)
  const onMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el || threadLoading || loadingOlder || !hasMoreOlder || olderFetchInFlightRef.current) return
    if (el.scrollTop > 96) return
    const now = Date.now()
    if (now - lastOlderScrollInvokeRef.current < 500) return
    lastOlderScrollInvokeRef.current = now
    void loadOlderMessages()
  }, [threadLoading, loadingOlder, hasMoreOlder, loadOlderMessages])

  useEffect(() => {
    if (loadingOlder || threadLoading) {
      prevMessagesLenForScrollRef.current = messages.length
      return
    }
    const el = messagesScrollRef.current
    const prevLen = prevMessagesLenForScrollRef.current
    const grew = messages.length > prevLen
    prevMessagesLenForScrollRef.current = messages.length
    if (!el || !grew) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [messages.length, threadLoading, loadingOlder])

  const sendMessage = async () => {
    const trimmed = draft.trim()
    if (!trimmed || !user?.id || !activeConversationId || sending) return

    setSending(true)
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: 'Вы',
      kind: 'text',
      body: trimmed,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft('')

    const res = await appendDirectMessage(activeConversationId, trimmed)
    if (res.error) {
      setError(res.error)
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(trimmed)
      setSending(false)
      queueMicrotask(() => composerTextareaRef.current?.focus())
      return
    }

    const snap = profile?.display_name?.trim() || 'Вы'
    const finalId = res.data?.messageId ?? optimistic.id
    const finalAt = res.data?.createdAt ?? optimistic.createdAt
    setMessages((prev) =>
      prev.map((m) =>
        m.id === optimistic.id
          ? { ...optimistic, id: finalId, createdAt: finalAt, senderNameSnapshot: snap }
          : m,
      ),
    )

    setItems((prev) =>
      prev.map((item) =>
        item.id === activeConversationId
          ? {
              ...item,
              lastMessageAt: res.data?.createdAt ?? optimistic.createdAt,
              lastMessagePreview: trimmed,
              messageCount: item.messageCount + 1,
              unreadCount: 0,
            }
          : item,
      ),
    )
    setActiveConversation((prev) =>
      prev && prev.id === activeConversationId
        ? {
            ...prev,
            lastMessageAt: res.data?.createdAt ?? optimistic.createdAt,
            lastMessagePreview: trimmed,
            messageCount: prev.messageCount + 1,
            unreadCount: 0,
          }
        : prev,
    )
    setSending(false)
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
      composerTextareaRef.current?.focus()
    })
  }

  const sortedItems = useMemo(() => sortConversationsByActivity(items), [items])

  const timelineMessages = useMemo(
    () => messages.filter((m) => m.kind !== 'reaction'),
    [messages],
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
    for (const [, arr] of map) {
      arr.sort(sortDirectMessagesChrono)
    }
    return map
  }, [messages])

  const syncThreadListAfterReaction = useCallback(
    (convId: string, patch: { messageCountDelta: number; touchTail: boolean; tailAt?: string | null; tailPreview?: string | null }) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== convId) return item
          const messageCount = Math.max(0, item.messageCount + patch.messageCountDelta)
          if (!patch.touchTail) return { ...item, messageCount }
          return {
            ...item,
            messageCount,
            lastMessageAt: patch.tailAt ?? item.lastMessageAt,
            lastMessagePreview: patch.tailPreview ?? item.lastMessagePreview,
          }
        }),
      )
      setActiveConversation((prev) => {
        if (!prev || prev.id !== convId) return prev
        const messageCount = Math.max(0, prev.messageCount + patch.messageCountDelta)
        if (!patch.touchTail) return { ...prev, messageCount }
        return {
          ...prev,
          messageCount,
          lastMessageAt: patch.tailAt ?? prev.lastMessageAt,
          lastMessagePreview: patch.tailPreview ?? prev.lastMessagePreview,
        }
      })
    },
    [],
  )

  const toggleMessengerReaction = useCallback(
    async (targetMessageId: string, emoji: ReactionEmoji) => {
      const convId = activeConversationId.trim()
      if (!user?.id || !convId || threadLoading) return

      const snapshot = messagesRef.current
      const sortedBefore = [...snapshot].sort(sortDirectMessagesChrono)
      const tailIdBefore = sortedBefore[sortedBefore.length - 1]?.id ?? null

      const res = await toggleDirectMessageReaction(convId, targetMessageId, emoji)
      if (conversationIdRef.current.trim() !== convId) return

      if (res.error) {
        setError(res.error)
        return
      }
      const payload = res.data
      if (!payload) return

      if (payload.action === 'removed') {
        const removedId = payload.messageId
        reactionDeleteSidebarSyncedRef.current.add(removedId)
        setMessages((prev) => prev.filter((m) => m.id !== removedId))
        const touchedLatest = removedId === tailIdBefore
        if (touchedLatest) {
          const next = snapshot.filter((m) => m.id !== removedId)
          const sorted = [...next].sort(sortDirectMessagesChrono)
          const tailAny = sorted[sorted.length - 1] ?? null
          const tailPreview = lastNonReactionBody(next)
          syncThreadListAfterReaction(convId, {
            messageCountDelta: -1,
            touchTail: true,
            tailAt: tailAny?.createdAt ?? null,
            tailPreview,
          })
        } else {
          syncThreadListAfterReaction(convId, { messageCountDelta: -1, touchTail: false })
        }
        return
      }

      const createdAt = payload.createdAt ?? new Date().toISOString()
      const snap = profile?.display_name?.trim() || 'Вы'
      const newRow: DirectMessage = {
        id: payload.messageId,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'reaction',
        body: emoji,
        createdAt,
        meta: { react_to: targetMessageId },
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === newRow.id)) return prev
        return [...prev, newRow].sort(sortDirectMessagesChrono)
      })
      const mergedForPreview = [...snapshot, newRow]
      const textPreview = lastNonReactionBody(mergedForPreview)
      syncThreadListAfterReaction(convId, {
        messageCountDelta: 1,
        touchTail: true,
        tailAt: createdAt,
        tailPreview: textPreview ?? null,
      })
    },
    [activeConversationId, profile?.display_name, syncThreadListAfterReaction, threadLoading, user?.id],
  )

  const openReactionPicker = useCallback((clientX: number, clientY: number, messageId: string) => {
    const margin = 10
    const x = Math.min(Math.max(margin, clientX), window.innerWidth - margin)
    const y = Math.min(Math.max(margin, clientY), window.innerHeight - margin)
    setReactionPick({ messageId, clientX: x, clientY: y })
  }, [])

  const onMessageDoubleClick = useCallback(
    (messageId: string) => {
      void toggleMessengerReaction(messageId, MESSENGER_LIKE_EMOJI)
    },
    [toggleMessengerReaction],
  )

  const onMessageContextMenu = useCallback(
    (e: MouseEvent, messageId: string) => {
      e.preventDefault()
      openReactionPicker(e.clientX, e.clientY, messageId)
    },
    [openReactionPicker],
  )

  /** Шапка треда: сразу из списка по URL, пока грузится полная карточка с сервера */
  const threadHeadConversation =
    sortedItems.find((i) => i.id === activeConversationId) ?? activeConversation

  const activeAvatarUrl =
    threadHeadConversation?.avatarUrl ??
    (threadHeadConversation?.otherUserId ? null : profile?.avatar_url ?? null)

  const closeMessengerMenu = useCallback(() => {
    setMessengerMenuOpen(false)
  }, [])

  const goCreateRoomFromMenu = useCallback(() => {
    const id = newRoomId()
    setPendingHostClaim(id)
    closeMessengerMenu()
    navigate(`/r/${encodeURIComponent(id)}`)
  }, [closeMessengerMenu, navigate])

  useEffect(() => {
    if (!messengerMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMessengerMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messengerMenuOpen, closeMessengerMenu])

  return (
    <DashboardShell
      active="messenger"
      canAccessAdmin={canAccessAdmin}
      onSignOut={() => signOut()}
      chromeless={isMobileMessenger}
    >
      <section
        className={`dashboard-section dashboard-messenger dashboard-messenger--fill${
          isMobileMessenger ? ' dashboard-messenger--mobile-chromeless' : ''
        }`}
      >
        {!isMobileMessenger ? (
          <div className="dashboard-messenger__topbar">
            <h2 className="dashboard-section__title dashboard-messenger__page-title">Мессенджер</h2>
            <Link to="/dashboard/chats" className="dashboard-messenger__switch">
              Архивы комнат
            </Link>
          </div>
        ) : null}

        {error ? <p className="join-error">{error}</p> : null}

        {!error ? (
          <div className="dashboard-messenger__layout">
            {showListPane ? (
              <aside className="dashboard-messenger__list" aria-label="Список диалогов">
                {loading && sortedItems.length === 0 ? (
                  <div className="dashboard-messenger__pane-loader" aria-label="Загрузка списка…">
                    <BrandLogoLoader size={56} />
                  </div>
                ) : sortedItems.length === 0 ? (
                  <div className="dashboard-chats-empty">Диалогов пока нет.</div>
                ) : (
                  sortedItems.map((item) => {
                    const avatarUrl = item.avatarUrl ?? (!item.otherUserId ? profile?.avatar_url ?? null : null)
                    return (
                      <Link
                        key={item.id}
                        to={buildMessengerUrl(item.id)}
                        onClick={(e) => {
                          e.preventDefault()
                          selectConversation(item.id)
                        }}
                        className={`dashboard-messenger__row${
                          item.id === activeConversationId ? ' dashboard-messenger__row--active' : ''
                        }`}
                      >
                        <div className="dashboard-messenger__row-main">
                          <div className="dashboard-messenger__row-avatar" aria-hidden>
                            {avatarUrl ? (
                              <img src={avatarUrl ?? undefined} alt="" />
                            ) : (
                              <span>{conversationInitial(item.title)}</span>
                            )}
                          </div>
                          <div className="dashboard-messenger__row-content">
                            <div className="dashboard-messenger__row-titleline">
                              <div className="dashboard-messenger__row-title">{item.title}</div>
                              {item.unreadCount > 0 ? (
                                <span className="dashboard-messenger__row-badge">
                                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                </span>
                              ) : null}
                            </div>
                            <div className="dashboard-messenger__row-meta">
                              <span>{item.messageCount} сообщ.</span>
                              <span>{formatDateTime(item.lastMessageAt ?? item.createdAt)}</span>
                            </div>
                            <div className="dashboard-messenger__row-preview">
                              {item.lastMessagePreview?.trim() || 'Пока без сообщений'}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })
                )}
              </aside>
            ) : null}

            {showThreadPane ? (
              <div className="dashboard-messenger__thread">
                {loading && !threadHeadConversation ? (
                  <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…">
                    <BrandLogoLoader size={56} />
                  </div>
                ) : threadHeadConversation ? (
                  <>
                    <div className="dashboard-messenger__thread-head">
                      {isMobileMessenger ? (
                        <button
                          type="button"
                          className="dashboard-messenger__back-btn"
                          onClick={() => navigate('/dashboard/messenger?view=list', { replace: true })}
                        >
                          ← Назад к чатам
                        </button>
                      ) : null}
                      <div className="dashboard-messenger__thread-head-main">
                        <div className="dashboard-messenger__thread-avatar" aria-hidden>
                          {activeAvatarUrl ? (
                            <img src={activeAvatarUrl ?? undefined} alt="" />
                          ) : (
                            <span>{conversationInitial(threadHeadConversation.title)}</span>
                          )}
                        </div>
                        <div>
                          <div className="dashboard-messenger__thread-titleline">
                            <h3 className="dashboard-section__subtitle">{threadHeadConversation.title}</h3>
                            {threadHeadConversation.unreadCount > 0 ? (
                              <span className="dashboard-messenger__row-badge">
                                {threadHeadConversation.unreadCount > 99
                                  ? '99+'
                                  : threadHeadConversation.unreadCount}
                              </span>
                            ) : null}
                          </div>
                          <div className="dashboard-messenger__thread-meta">
                            <span>{threadHeadConversation.messageCount} сообщ.</span>
                            <span>
                              Последняя активность:{' '}
                              {formatDateTime(
                                threadHeadConversation.lastMessageAt ?? threadHeadConversation.createdAt,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="dashboard-messenger__thread-main">
                      <div
                        ref={messagesScrollRef}
                        className="dashboard-messenger__messages-scroll"
                        onScroll={onMessagesScroll}
                      >
                        {loadingOlder ? (
                          <div className="dashboard-messenger__load-older" role="status" aria-live="polite">
                            Загрузка истории…
                          </div>
                        ) : null}
                        <div className="dashboard-messenger__messages">
                          {threadLoading ? (
                            <div
                              className="dashboard-messenger__thread-loading"
                              role="status"
                              aria-label="Загрузка диалога…"
                            >
                              <BrandLogoLoader size={56} />
                            </div>
                          ) : timelineMessages.length === 0 ? (
                            <div className="dashboard-chats-empty">Напиши первое сообщение в этот чат.</div>
                          ) : (
                            timelineMessages.map((message) => {
                              const isOwn = user?.id && message.senderUserId === user.id
                              const reactions = reactionsByTargetId.get(message.id) ?? []
                              const reactionCounts = new Map<string, number>()
                              for (const r of reactions) {
                                const key = r.body.trim() || r.body
                                reactionCounts.set(key, (reactionCounts.get(key) ?? 0) + 1)
                              }
                              return (
                                <article
                                  key={message.id}
                                  className={`dashboard-messenger__message${
                                    isOwn ? ' dashboard-messenger__message--own' : ''
                                  }`}
                                  onDoubleClick={() => onMessageDoubleClick(message.id)}
                                  onContextMenu={(e) => onMessageContextMenu(e, message.id)}
                                >
                                  <div className="dashboard-messenger__message-meta">
                                    <span className="dashboard-messenger__message-author">
                                      {message.senderNameSnapshot}
                                    </span>
                                    <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
                                  </div>
                                  <div className="dashboard-messenger__message-body">
                                    <MessengerMessageBody text={message.body} />
                                  </div>
                                  {reactionCounts.size > 0 ? (
                                    <div
                                      className="dashboard-messenger__message-reactions"
                                      aria-label="Реакции"
                                      onDoubleClick={(e) => e.stopPropagation()}
                                    >
                                      {[...reactionCounts.entries()].map(([emoji, count]) => (
                                        <span key={emoji} className="dashboard-messenger__reaction-chip">
                                          <span className="dashboard-messenger__reaction-emoji">{emoji}</span>
                                          {count > 1 ? (
                                            <span className="dashboard-messenger__reaction-count">{count}</span>
                                          ) : null}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </article>
                              )
                            })
                          )}
                        </div>
                      </div>

                      <div className="dashboard-messenger__composer">
                        <textarea
                          ref={composerTextareaRef}
                          className="dashboard-messenger__input"
                          rows={3}
                          placeholder="Напиши сообщение..."
                          value={draft}
                          disabled={threadLoading}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              void sendMessage()
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn"
                          disabled={!draft.trim() || sending || threadLoading}
                          onClick={() => void sendMessage()}
                        >
                          Отправить
                        </button>
                      </div>
                    </div>

                    {reactionPick
                      ? createPortal(
                          <div
                            className="dashboard-messenger__reaction-popover-wrap"
                            style={{
                              position: 'fixed',
                              left: reactionPick.clientX,
                              top: reactionPick.clientY,
                              transform: 'translate(-50%, -100%) translateY(-10px)',
                            }}
                          >
                            <ReactionEmojiPopover
                              onClose={() => setReactionPick(null)}
                              onPick={(emoji) => {
                                const targetId = reactionPick.messageId
                                setReactionPick(null)
                                if (!isDirectReactionEmoji(emoji)) return
                                void toggleMessengerReaction(targetId, emoji)
                              }}
                            />
                          </div>,
                          document.body,
                        )
                      : null}
                  </>
                ) : (
                  <div className="dashboard-chats-empty">Выберите диалог слева.</div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {isMobileMessenger ? (
          <>
            <div
              className={`dashboard-messenger-mobile-nav-backdrop${
                messengerMenuOpen ? ' dashboard-messenger-mobile-nav-backdrop--open' : ''
              }`}
              aria-hidden={!messengerMenuOpen}
              onClick={closeMessengerMenu}
            />
            <nav
              className={`dashboard-messenger-mobile-nav${
                messengerMenuOpen ? ' dashboard-messenger-mobile-nav--open' : ''
              }`}
              aria-hidden={!messengerMenuOpen}
              aria-label="Навигация"
            >
              <div className="dashboard-messenger-mobile-nav__header">
                <span className="dashboard-messenger-mobile-nav__title">Меню</span>
                <button
                  type="button"
                  className="dashboard-messenger-mobile-nav__close"
                  onClick={closeMessengerMenu}
                  aria-label="Закрыть меню"
                >
                  ✕
                </button>
              </div>
              <div className="dashboard-messenger-mobile-nav__scroll">
                <Link to="/" className="dashboard-messenger-mobile-nav__link" onClick={closeMessengerMenu}>
                  На главную
                </Link>
                <Link to="/dashboard" className="dashboard-messenger-mobile-nav__link" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-mobile-nav__link-ico" aria-hidden>
                    <DashboardIcon />
                  </span>
                  Кабинет
                </Link>
                <Link to="/dashboard/chats" className="dashboard-messenger-mobile-nav__link" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-mobile-nav__link-ico" aria-hidden>
                    <RoomsIcon />
                  </span>
                  Архивы комнат
                </Link>
                <Link to="/dashboard/messenger" className="dashboard-messenger-mobile-nav__link" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-mobile-nav__link-ico" aria-hidden>
                    <ChatBubbleIcon />
                  </span>
                  Мессенджер
                  {headerMessengerUnread > 0 ? (
                    <span className="dashboard-messenger-mobile-nav__badge">
                      {headerMessengerUnread > 99 ? '99+' : headerMessengerUnread}
                    </span>
                  ) : null}
                </Link>
                <Link to="/dashboard/friends" className="dashboard-messenger-mobile-nav__link" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-mobile-nav__link-ico" aria-hidden>
                    <ParticipantsBadgeIcon />
                  </span>
                  Друзья
                </Link>
                {canAccessAdmin ? (
                  <Link to="/admin" className="dashboard-messenger-mobile-nav__link" onClick={closeMessengerMenu}>
                    <span className="dashboard-messenger-mobile-nav__link-ico" aria-hidden>
                      <AdminPanelIcon />
                    </span>
                    Админка
                  </Link>
                ) : null}
                <div className="dashboard-messenger-mobile-nav__row">
                  <span className="dashboard-messenger-mobile-nav__row-label">Тема</span>
                  <ThemeToggle variant="inline" className="theme-toggle--dashboard" />
                </div>
                <button type="button" className="dashboard-messenger-mobile-nav__btn" onClick={goCreateRoomFromMenu}>
                  Новая комната
                </button>
                <button
                  type="button"
                  className="dashboard-messenger-mobile-nav__btn dashboard-messenger-mobile-nav__btn--danger"
                  onClick={() => {
                    closeMessengerMenu()
                    void signOut()
                  }}
                >
                  Выход
                </button>
              </div>
            </nav>
            <button
              type="button"
              className={`dashboard-messenger-fab${messengerMenuOpen ? ' dashboard-messenger-fab--open' : ''}`}
              onClick={() => setMessengerMenuOpen((v) => !v)}
              aria-label={messengerMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={messengerMenuOpen}
            >
              <MenuBurgerIcon />
            </button>
          </>
        ) : null}
      </section>
    </DashboardShell>
  )
}
