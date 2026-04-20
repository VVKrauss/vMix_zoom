import { useEffect, useMemo, useReducer, useRef, type MutableRefObject } from 'react'
import type { InviteConversationPreview } from '../lib/groups'
import { getDirectConversationForUser, listDirectMessagesPage, type DirectMessage } from '../lib/messenger'
import type { MessengerConversationKind, MessengerConversationSummary } from '../lib/messengerConversations'
import { DM_PAGE_SIZE, pickDefaultConversationId } from '../lib/messengerDashboardUtils'
import { readMessengerThreadTailCache, writeMessengerThreadTailCache } from '../lib/messengerThreadTailCache'

export type MessengerThreadPhase = 'idle' | 'loading' | 'ready' | 'error'

export type MessengerThreadVM = {
  activeId: string
  phase: MessengerThreadPhase
  activeConversation: MessengerConversationSummary | null
  messages: DirectMessage[]
  hasMoreOlder: boolean
  error: string | null
}

type CacheEntry = {
  at: number
  activeConversation: MessengerConversationSummary
  messages: DirectMessage[]
  hasMoreOlder: boolean
}

type Action =
  | { type: 'CLEAR' }
  | { type: 'SWITCH_LOADING'; id: string }
  | { type: 'READY_NON_DIRECT'; id: string; conversation: MessengerConversationSummary }
  | { type: 'READY_FROM_CACHE'; id: string; entry: CacheEntry }
  | { type: 'LOCAL_UPDATE_MESSAGES'; update: (prev: DirectMessage[]) => DirectMessage[] }
  | {
      type: 'LOCAL_UPDATE_CONVERSATION'
      update: (prev: MessengerConversationSummary | null) => MessengerConversationSummary | null
    }
  | { type: 'LOCAL_UPDATE_HAS_MORE_OLDER'; update: (prev: boolean) => boolean }
  | {
      type: 'THREAD_LOADED'
      id: string
      conversation: MessengerConversationSummary
      messages: DirectMessage[]
      hasMoreOlder: boolean
    }
  | { type: 'THREAD_ERROR'; id: string; message: string; conversation?: MessengerConversationSummary | null }

const initialVM: MessengerThreadVM = {
  activeId: '',
  phase: 'idle',
  activeConversation: null,
  messages: [],
  hasMoreOlder: false,
  error: null,
}

function reducer(state: MessengerThreadVM, action: Action): MessengerThreadVM {
  switch (action.type) {
    case 'CLEAR':
      return initialVM
    case 'SWITCH_LOADING':
      return {
        activeId: action.id,
        phase: 'loading',
        activeConversation: state.activeConversation?.id === action.id ? state.activeConversation : null,
        messages: [],
        hasMoreOlder: false,
        error: null,
      }
    case 'READY_NON_DIRECT':
      return {
        activeId: action.id,
        phase: 'ready',
        activeConversation: action.conversation,
        messages: [],
        hasMoreOlder: false,
        error: null,
      }
    case 'READY_FROM_CACHE':
      return {
        activeId: action.id,
        phase: 'ready',
        activeConversation: action.entry.activeConversation,
        messages: action.entry.messages,
        hasMoreOlder: action.entry.hasMoreOlder,
        error: null,
      }
    case 'LOCAL_UPDATE_MESSAGES':
      return { ...state, messages: action.update(state.messages) }
    case 'LOCAL_UPDATE_CONVERSATION':
      return { ...state, activeConversation: action.update(state.activeConversation) }
    case 'LOCAL_UPDATE_HAS_MORE_OLDER':
      return { ...state, hasMoreOlder: action.update(state.hasMoreOlder) }
    case 'THREAD_LOADED':
      return {
        activeId: action.id,
        phase: 'ready',
        activeConversation: action.conversation,
        messages: action.messages,
        hasMoreOlder: action.hasMoreOlder,
        error: null,
      }
    case 'THREAD_ERROR':
      return {
        activeId: action.id,
        phase: 'error',
        activeConversation: action.conversation ?? null,
        messages: [],
        hasMoreOlder: false,
        error: action.message,
      }
    default:
      return state
  }
}

function shallowSameMessages(a: DirectMessage[], b: DirectMessage[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) return false
  }
  return true
}

export function useMessengerThreadVM(opts: {
  userId: string | undefined
  loading: boolean
  listOnlyMobile: boolean
  isOnline: boolean
  conversationId: string
  urlConversationId: string
  inviteToken: string
  invitePreview: InviteConversationPreview | null
  inviteError: string | null
  inviteLoading: boolean
  pendingJump: {
    conversationId: string
    messageId: string
    parentMessageId?: string | null
    conversationKind?: MessengerConversationKind
    sourceTitle?: string
    sourceAvatarUrl?: string | null
  } | null
  mergedItemsRef: MutableRefObject<MessengerConversationSummary[]>
  conversationIdRef: MutableRefObject<string>
  lastFetchedThreadIdRef: MutableRefObject<string | null>
  prevThreadIdForClearRef: MutableRefObject<string | null>
  setError: (msg: string | null) => void
}): {
  vm: MessengerThreadVM
  setMessages: (next: DirectMessage[] | ((prev: DirectMessage[]) => DirectMessage[])) => void
  setActiveConversation: (
    next: MessengerConversationSummary | null | ((prev: MessengerConversationSummary | null) => MessengerConversationSummary | null),
  ) => void
  setHasMoreOlder: (next: boolean | ((prev: boolean) => boolean)) => void
} {
  const [vm, dispatch] = useReducer(reducer, initialVM)
  const cacheRef = useRef(new Map<string, CacheEntry>())
  const loadSeqRef = useRef(0)
  const prevIsOnlineRef = useRef<boolean | null>(null)
  const vmRef = useRef(vm)
  vmRef.current = vm

  const stable = useMemo(() => ({ dispatch, cacheRef }), [])

  useEffect(() => {
    const run = async () => {
      const prevOn = prevIsOnlineRef.current
      prevIsOnlineRef.current = opts.isOnline
      if (prevOn === false && opts.isOnline === true) {
        opts.lastFetchedThreadIdRef.current = null
      }

      if (!opts.userId || opts.loading) return
      if (opts.listOnlyMobile) {
        opts.lastFetchedThreadIdRef.current = null
        stable.dispatch({ type: 'CLEAR' })
        return
      }

      const token = opts.inviteToken.trim()
      const preview = opts.invitePreview
      if (token && !preview?.id && !opts.inviteError) {
        // invite preview is loading: keep current vm, just avoid fetching thread
        return
      }

      if (token && preview?.id && !opts.mergedItemsRef.current.some((i) => i.id === preview.id && !i.joinRequestPending)) {
        const placeholder: MessengerConversationSummary = {
          id: preview.id,
          kind: preview.kind,
          title: preview.title,
          createdAt: new Date(0).toISOString(),
          lastMessageAt: null,
          lastMessagePreview: null,
          messageCount: 0,
          unreadCount: 0,
          isPublic: preview.isPublic,
          publicNick: preview.publicNick,
          avatarPath: preview.avatarPath,
          avatarThumbPath: preview.avatarThumbPath,
          memberCount: preview.memberCount,
          ...(preview.kind === 'channel'
            ? { postingMode: preview.postingMode ?? 'admins_only', commentsMode: preview.commentsMode ?? 'everyone' }
            : {}),
        }
        stable.dispatch({ type: 'READY_NON_DIRECT', id: preview.id, conversation: placeholder })
        return
      }

      const holdInviteThreadPick = Boolean(opts.inviteToken.trim()) && !opts.invitePreview?.id?.trim() && !opts.inviteError
      const startedTarget =
        opts.conversationId.trim() ||
        (holdInviteThreadPick ? '' : pickDefaultConversationId(opts.mergedItemsRef.current, null) || '')
      if (!startedTarget) {
        opts.lastFetchedThreadIdRef.current = null
        stable.dispatch({ type: 'CLEAR' })
        return
      }

      const startedSummary = opts.mergedItemsRef.current.find((i) => i.id === startedTarget) ?? null
      const pendingPlaceholder =
        !startedSummary &&
        opts.pendingJump?.conversationId.trim() === startedTarget &&
        (opts.pendingJump.conversationKind === 'group' || opts.pendingJump.conversationKind === 'channel')
          ? ({
              id: startedTarget,
              kind: opts.pendingJump.conversationKind,
              title:
                opts.pendingJump.sourceTitle?.trim() ||
                (opts.pendingJump.conversationKind === 'channel' ? 'Канал' : 'Группа'),
              createdAt: new Date(0).toISOString(),
              lastMessageAt: null,
              lastMessagePreview: null,
              messageCount: 0,
              unreadCount: 0,
              isPublic: true,
              publicNick: null,
              avatarPath: null,
              avatarThumbPath: null,
              memberCount: 0,
              ...(opts.pendingJump.conversationKind === 'channel'
                ? { postingMode: 'admins_only' as const, commentsMode: 'everyone' as const }
                : {}),
            } satisfies MessengerConversationSummary)
          : null

      const nonDirectSummary = startedSummary ?? pendingPlaceholder
      if (nonDirectSummary && nonDirectSummary.kind !== 'direct') {
        opts.lastFetchedThreadIdRef.current = null
        stable.dispatch({ type: 'READY_NON_DIRECT', id: startedTarget, conversation: nonDirectSummary })
        return
      }

      // Direct
      const prevOpenedId = opts.prevThreadIdForClearRef.current
      const conversationSwitched = prevOpenedId !== startedTarget
      if (conversationSwitched) {
        opts.prevThreadIdForClearRef.current = startedTarget
        opts.lastFetchedThreadIdRef.current = null
      }

      const cacheHit = stable.cacheRef.current.get(startedTarget)
      if (cacheHit) {
        stable.dispatch({ type: 'READY_FROM_CACHE', id: startedTarget, entry: cacheHit })
      } else {
        stable.dispatch({ type: 'SWITCH_LOADING', id: startedTarget })
      }

      // Prevent duplicate fetches when already fetched and online
      if (opts.lastFetchedThreadIdRef.current === startedTarget && opts.isOnline) return

      const seq = (loadSeqRef.current += 1)
      const applyIfCurrent = () =>
        seq === loadSeqRef.current &&
        (opts.conversationIdRef.current.trim() || pickDefaultConversationId(opts.mergedItemsRef.current, null) || '') ===
          startedTarget

      if (!opts.isOnline) {
        const cachedTail = await readMessengerThreadTailCache('direct', startedTarget)
        const summary =
          opts.mergedItemsRef.current.find((i) => i.id === startedTarget && i.kind === 'direct') ?? null
        if (!applyIfCurrent()) return
        if (cachedTail?.length && summary) {
          const convo = { ...summary, kind: 'direct' as const }
          stable.dispatch({
            type: 'THREAD_LOADED',
            id: startedTarget,
            conversation: convo,
            messages: cachedTail,
            hasMoreOlder: true,
          })
          opts.lastFetchedThreadIdRef.current = startedTarget
          stable.cacheRef.current.set(startedTarget, { at: Date.now(), activeConversation: convo, messages: cachedTail, hasMoreOlder: true })
        } else if (summary) {
          stable.dispatch({ type: 'THREAD_ERROR', id: startedTarget, message: 'Нет сети. Сохранённых сообщений для этого чата нет.', conversation: { ...summary, kind: 'direct' } })
        } else {
          stable.dispatch({ type: 'THREAD_ERROR', id: startedTarget, message: 'Нет сети.' })
        }
        return
      }

      try {
        const [conversationRes, messagesRes] = await Promise.all([
          getDirectConversationForUser(startedTarget),
          listDirectMessagesPage(startedTarget, { limit: DM_PAGE_SIZE }),
        ])
        if (!applyIfCurrent()) return

        if (conversationRes.error) {
          opts.setError(conversationRes.error)
          stable.dispatch({ type: 'THREAD_ERROR', id: startedTarget, message: conversationRes.error })
          opts.lastFetchedThreadIdRef.current = null
          return
        }
        if (!conversationRes.data) {
          stable.dispatch({ type: 'THREAD_ERROR', id: startedTarget, message: 'Чат не найден или у вас нет к нему доступа.' })
          opts.lastFetchedThreadIdRef.current = null
          return
        }

        const convo = { ...conversationRes.data, kind: 'direct' as const }
        if (messagesRes.error) {
          const cachedTail = await readMessengerThreadTailCache('direct', startedTarget)
          if (!applyIfCurrent()) return
          if (cachedTail?.length) {
            stable.dispatch({
              type: 'THREAD_LOADED',
              id: startedTarget,
              conversation: convo,
              messages: cachedTail,
              hasMoreOlder: true,
            })
            opts.lastFetchedThreadIdRef.current = startedTarget
            stable.cacheRef.current.set(startedTarget, { at: Date.now(), activeConversation: convo, messages: cachedTail, hasMoreOlder: true })
          } else {
            opts.setError(messagesRes.error)
            stable.dispatch({
              type: 'THREAD_ERROR',
              id: startedTarget,
              message: messagesRes.error,
              conversation: { ...convo, unreadCount: 0 },
            })
            opts.lastFetchedThreadIdRef.current = null
          }
          return
        }

        const list = messagesRes.data ?? []
        // If we already rendered from cache and nothing changed, skip dispatch to avoid an extra render.
        const cur = vmRef.current
        if (cur.activeId === startedTarget && cur.phase === 'ready' && shallowSameMessages(cur.messages, list)) {
          opts.lastFetchedThreadIdRef.current = startedTarget
          stable.cacheRef.current.set(startedTarget, { at: Date.now(), activeConversation: convo, messages: list, hasMoreOlder: messagesRes.hasMoreOlder })
          return
        }

        stable.dispatch({
          type: 'THREAD_LOADED',
          id: startedTarget,
          conversation: convo,
          messages: list,
          hasMoreOlder: messagesRes.hasMoreOlder,
        })
        opts.lastFetchedThreadIdRef.current = startedTarget
        stable.cacheRef.current.set(startedTarget, { at: Date.now(), activeConversation: convo, messages: list, hasMoreOlder: messagesRes.hasMoreOlder })
        void writeMessengerThreadTailCache('direct', startedTarget, list)
      } finally {
        // phase is managed by reducer; no-op here
      }
    }

    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    opts.userId,
    opts.loading,
    opts.listOnlyMobile,
    opts.isOnline,
    opts.conversationId,
    opts.urlConversationId,
    opts.inviteToken,
    opts.invitePreview,
    opts.inviteError,
    opts.inviteLoading,
    opts.pendingJump,
  ])

  return {
    vm,
    setMessages: (next) => {
      dispatch({
        type: 'LOCAL_UPDATE_MESSAGES',
        update: typeof next === 'function' ? (next as any) : () => next,
      })
    },
    setActiveConversation: (next) => {
      dispatch({
        type: 'LOCAL_UPDATE_CONVERSATION',
        update: typeof next === 'function' ? (next as any) : () => next,
      })
    },
    setHasMoreOlder: (next) => {
      dispatch({
        type: 'LOCAL_UPDATE_HAS_MORE_OLDER',
        update: typeof next === 'function' ? (next as any) : () => next,
      })
    },
  }
}

