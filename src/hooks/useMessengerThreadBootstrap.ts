import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { InviteConversationPreview } from '../lib/groups'
import { getDirectConversationForUser, listDirectMessagesPage, type DirectMessage } from '../lib/messenger'
import type { MessengerConversationKind, MessengerConversationSummary } from '../lib/messengerConversations'
import { readMessengerThreadTailCache, writeMessengerThreadTailCache } from '../lib/messengerThreadTailCache'
import { DM_PAGE_SIZE, pickDefaultConversationId } from '../lib/messengerDashboardUtils'

export type MessengerPendingJumpState = {
  conversationId: string
  messageId: string
  parentMessageId?: string | null
  conversationKind?: MessengerConversationKind
  sourceTitle?: string
  sourceAvatarUrl?: string | null
} | null

/**
 * Открытие активного треда: invite-плейсхолдеры, группа/канал без DM-ленты, загрузка direct + сообщений.
 */
export function useMessengerThreadBootstrap(opts: {
  userId: string | undefined
  loading: boolean
  listOnlyMobile: boolean
  conversationId: string
  urlConversationId: string
  inviteToken: string
  invitePreview: InviteConversationPreview | null
  inviteError: string | null
  inviteLoading: boolean
  pendingJump: MessengerPendingJumpState
  pendingJoinSidebarById: Record<string, MessengerConversationSummary>
  mergedItemsRef: MutableRefObject<MessengerConversationSummary[]>
  conversationIdRef: MutableRefObject<string>
  lastFetchedThreadIdRef: MutableRefObject<string | null>
  prevThreadIdForClearRef: MutableRefObject<string | null>
  setThreadLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setActiveConversation: Dispatch<SetStateAction<MessengerConversationSummary | null>>
  setMessages: Dispatch<SetStateAction<DirectMessage[]>>
  setHasMoreOlder: Dispatch<SetStateAction<boolean>>
  setReplyTo: Dispatch<SetStateAction<DirectMessage | null>>
  setEditingMessageId: Dispatch<SetStateAction<string | null>>
  setComposerEmojiOpen: Dispatch<SetStateAction<boolean>>
  setMessageMenu: Dispatch<
    SetStateAction<{
      message: DirectMessage
      mode: 'kebab' | 'context'
      anchorX: number
      anchorY: number
    } | null>
  >
  setItems: Dispatch<SetStateAction<MessengerConversationSummary[]>>
  isOnline: boolean
}): void {
  const {
    userId,
    loading,
    listOnlyMobile,
    isOnline,
    conversationId,
    urlConversationId,
    inviteToken,
    invitePreview,
    inviteError,
    inviteLoading,
    pendingJump,
    pendingJoinSidebarById,
    mergedItemsRef,
    conversationIdRef,
    lastFetchedThreadIdRef,
    prevThreadIdForClearRef,
    setThreadLoading,
    setError,
    setActiveConversation,
    setMessages,
    setHasMoreOlder,
    setReplyTo,
    setEditingMessageId,
    setComposerEmojiOpen,
    setMessageMenu,
    setItems,
  } = opts

  const prevIsOnlineRef = useRef<boolean | null>(null)

  useEffect(() => {
    const run = async () => {
      const prevOn = prevIsOnlineRef.current
      prevIsOnlineRef.current = isOnline
      if (prevOn === false && isOnline === true) {
        lastFetchedThreadIdRef.current = null
      }

      if (!userId || loading) return
      if (listOnlyMobile) {
        lastFetchedThreadIdRef.current = null
        setThreadLoading(false)
        setActiveConversation(null)
        setMessages([])
        setHasMoreOlder(false)
        setMessageMenu(null)
        return
      }

      const token = inviteToken.trim()
      const preview = invitePreview
      if (token && !preview?.id && !inviteError) {
        setThreadLoading(inviteLoading)
        setError(null)
        if (inviteLoading) return
      }
      if (token && preview?.id && !mergedItemsRef.current.some((i) => i.id === preview.id && !i.joinRequestPending)) {
        setError(null)
        setThreadLoading(false)
        setActiveConversation({
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
            ? {
                postingMode: preview.postingMode ?? 'admins_only',
                commentsMode: preview.commentsMode ?? 'everyone',
              }
            : {}),
        })
        setMessages([])
        setHasMoreOlder(false)
        setReplyTo(null)
        setEditingMessageId(null)
        setComposerEmojiOpen(false)
        setMessageMenu(null)
        return
      }
      const holdInviteThreadPick =
        Boolean(inviteToken.trim()) && !invitePreview?.id?.trim() && !inviteError
      const startedTarget =
        conversationId.trim() ||
        (holdInviteThreadPick ? '' : pickDefaultConversationId(mergedItemsRef.current, null) || '')
      if (!startedTarget) {
        lastFetchedThreadIdRef.current = null
        setActiveConversation(null)
        setMessages([])
        setHasMoreOlder(false)
        setThreadLoading(false)
        setMessageMenu(null)
        return
      }

      const startedSummary = mergedItemsRef.current.find((i) => i.id === startedTarget) ?? null

      const inviteWait =
        inviteToken.trim() &&
        startedTarget === urlConversationId.trim() &&
        (inviteLoading || !invitePreview?.id) &&
        !mergedItemsRef.current.some((i) => i.id === startedTarget && !i.joinRequestPending)
      if (inviteWait) {
        setError(null)
        setThreadLoading(inviteLoading)
        return
      }
      const pendingPlaceholder =
        !startedSummary &&
        pendingJump?.conversationId.trim() === startedTarget &&
        (pendingJump.conversationKind === 'group' || pendingJump.conversationKind === 'channel')
          ? {
              id: startedTarget,
              kind: pendingJump.conversationKind,
              title:
                pendingJump.sourceTitle?.trim() ||
                (pendingJump.conversationKind === 'channel' ? 'Канал' : 'Группа'),
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
              ...(pendingJump.conversationKind === 'channel'
                ? { postingMode: 'admins_only' as const, commentsMode: 'everyone' as const }
                : {}),
            }
          : null
      const nonDirectSummary = startedSummary ?? pendingPlaceholder
      if (nonDirectSummary && nonDirectSummary.kind !== 'direct') {
        setError(null)
        setActiveConversation(nonDirectSummary)
        setThreadLoading(false)
        lastFetchedThreadIdRef.current = null
        setMessages([])
        setHasMoreOlder(false)
        setReplyTo(null)
        setEditingMessageId(null)
        setComposerEmojiOpen(false)
        setMessageMenu(null)
        return
      }

      const prevOpenedId = prevThreadIdForClearRef.current
      const conversationSwitched = prevOpenedId !== startedTarget
      if (conversationSwitched) {
        prevThreadIdForClearRef.current = startedTarget
        lastFetchedThreadIdRef.current = null
        setMessages([])
        setHasMoreOlder(false)
        setReplyTo(null)
        setEditingMessageId(null)
        setComposerEmojiOpen(false)
        setMessageMenu(null)
      }

      if (lastFetchedThreadIdRef.current === startedTarget && isOnline) {
        setThreadLoading(false)
        return
      }

      if (!isOnline && lastFetchedThreadIdRef.current === startedTarget) {
        setThreadLoading(false)
        return
      }

      if (!isOnline) {
        setThreadLoading(true)
        setError(null)
        const cached = await readMessengerThreadTailCache('direct', startedTarget)
        const summary =
          mergedItemsRef.current.find((i) => i.id === startedTarget && i.kind === 'direct') ?? null
        const wantNow =
          conversationIdRef.current.trim() || pickDefaultConversationId(mergedItemsRef.current, null) || ''
        if (wantNow !== startedTarget) {
          setThreadLoading(false)
          return
        }
        if (cached?.length && summary) {
          setActiveConversation({ ...summary, kind: 'direct' })
          setMessages(cached)
          setHasMoreOlder(true)
          lastFetchedThreadIdRef.current = startedTarget
        } else if (summary) {
          setActiveConversation({ ...summary, kind: 'direct' })
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
          setError('Нет сети. Сохранённых сообщений для этого чата нет.')
        } else {
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
          setError('Нет сети.')
        }
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
          conversationIdRef.current.trim() || pickDefaultConversationId(mergedItemsRef.current, null) || ''
        if (wantNow !== startedTarget) return

        if (conversationRes.error) {
          setError(conversationRes.error)
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else if (!conversationRes.data) {
          const looksLikeGroupOrChannelWait =
            inviteToken.trim() &&
            startedTarget === urlConversationId.trim() &&
            (inviteLoading || !invitePreview?.id)
          if (!looksLikeGroupOrChannelWait) {
            setError('Чат не найден или у вас нет к нему доступа.')
          }
          setActiveConversation(null)
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else if (messagesRes.error) {
          const cached = await readMessengerThreadTailCache('direct', startedTarget)
          if (cached?.length && conversationRes.data) {
            setError(null)
            setActiveConversation({ ...conversationRes.data, kind: 'direct' })
            setMessages(cached)
            setHasMoreOlder(true)
            lastFetchedThreadIdRef.current = startedTarget
          } else {
            setError(messagesRes.error)
            setActiveConversation(
              conversationRes.data ? { ...conversationRes.data, kind: 'direct', unreadCount: 0 } : null,
            )
            setMessages([])
            setHasMoreOlder(false)
            lastFetchedThreadIdRef.current = null
          }
        } else {
          setActiveConversation({ ...conversationRes.data, kind: 'direct' })
          const list = messagesRes.data ?? []
          setMessages(list)
          setHasMoreOlder(messagesRes.hasMoreOlder)
          lastFetchedThreadIdRef.current = startedTarget
          void writeMessengerThreadTailCache('direct', startedTarget, list)
        }
      } finally {
        setThreadLoading(false)
      }
    }

    void run()
  }, [
    conversationId,
    inviteError,
    inviteLoading,
    invitePreview,
    inviteToken,
    isOnline,
    listOnlyMobile,
    loading,
    pendingJoinSidebarById,
    urlConversationId,
    userId,
  ])
}
