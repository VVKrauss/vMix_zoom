import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { InviteConversationPreview } from '../lib/groups'
import {
  getDirectConversationForUser,
  listDirectMessagesPage,
  markDirectConversationRead,
  requestMessengerUnreadRefresh,
  type DirectMessage,
} from '../lib/messenger'
import type { MessengerConversationKind, MessengerConversationSummary } from '../lib/messengerConversations'
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
}): void {
  const {
    userId,
    loading,
    listOnlyMobile,
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

  useEffect(() => {
    const run = async () => {
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

      if (lastFetchedThreadIdRef.current === startedTarget) {
        void markDirectConversationRead(startedTarget)
        setItems((prev) =>
          prev.map((item) => (item.id === startedTarget ? { ...item, unreadCount: 0 } : item)),
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
          setError(messagesRes.error)
          setActiveConversation(
            conversationRes.data ? { ...conversationRes.data, kind: 'direct', unreadCount: 0 } : null,
          )
          setMessages([])
          setHasMoreOlder(false)
          lastFetchedThreadIdRef.current = null
        } else {
          void markDirectConversationRead(startedTarget)
          setActiveConversation({ ...conversationRes.data, kind: 'direct', unreadCount: 0 })
          setMessages(messagesRes.data ?? [])
          setHasMoreOlder(messagesRes.hasMoreOlder)
          lastFetchedThreadIdRef.current = startedTarget
          setItems((prev) =>
            prev.map((item) => (item.id === startedTarget ? { ...item, unreadCount: 0 } : item)),
          )
          requestMessengerUnreadRefresh()
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
    listOnlyMobile,
    loading,
    pendingJoinSidebarById,
    urlConversationId,
    userId,
  ])
}
