import { memo, useRef, type Dispatch, type MutableRefObject, type ReactNode, type Ref, type RefObject, type SetStateAction } from 'react'
import { BrandLogoLoader } from '../BrandLogoLoader'
import { ChevronLeftIcon, FiRrIcon } from '../icons'
import { MessengerJumpToBottomFab } from '../MessengerJumpToBottomFab'
import {
  directOutgoingReceiptStatus,
  isDirectReactionEmoji,
  type DirectConversationSummary,
  type DirectMessage,
  type MessengerForwardNav,
} from '../../lib/messenger'
import { buildQuotePreview } from '../../lib/messengerQuotePreview'
import {
  conversationInitial,
  formatDateTime,
  formatMessengerListRowTime,
  formatMessengerDaySeparatorLabel,
  QUICK_REACTION_EMOJI,
} from '../../lib/messengerDashboardUtils'
import { resolveQuotedAvatarForDm } from '../../lib/messengerUi'
import type { PeerPresenceDisplay } from '../../lib/messengerPeerPresence'
import type { MessengerConversationSummary } from '../../lib/messengerConversations'
import type { ReactionEmoji } from '../../types/roomComms'
import { ThreadMessageBubble } from './ThreadMessageBubble'
import { StorageOrHttpAvatarImg } from './StorageOrHttpAvatarImg'
import { useDevRenderTrace } from '../../lib/devTrace'

export type MessengerDirectThreadHeadConversation = MessengerConversationSummary & { kind: 'direct' }

function MessengerDirectThreadBodyImpl(props: {
  isMobileMessenger: boolean
  navigate: (to: string, opts?: { replace?: boolean }) => void
  totalOtherUnread: number
  /** Курсор прочтения собеседника (ЛС) — индикаторы на исходящих. */
  directPeerLastReadAt: string | null
  viewerDmReceiptsPrivate: boolean
  peerDmReceiptsPrivate: boolean
  threadHeadConversation: MessengerDirectThreadHeadConversation
  /** Собеседник: оффлайн / онлайн / в звонке (кольцо). */
  directPeerPresenceDisplay?: PeerPresenceDisplay
  /** Последняя активность собеседника (ISO), если разрешено профилем. */
  directPeerLastActivityAt?: string | null
  /** false — собеседник скрыл время активности; строку «Был(а): …» не показываем. */
  directPeerShowLastActivity?: boolean
  openUserPeek: (p: { userId: string; displayName?: string | null; avatarUrl?: string | null }) => void
  user: { id: string } | null | undefined
  profile: { display_name?: string | null; avatar_url?: string | null } | null | undefined
  activeAvatarUrl: string | null
  isMemberOfActiveConversation: boolean
  goCreateRoomFromMessenger: () => void
  messagesScrollRef: MutableRefObject<HTMLDivElement | null>
  /** Sentinel внизу скролла — пересечение с viewport = хвост ленты «увиден» (mark read). */
  readTailRef?: RefObject<HTMLDivElement | null>
  onMessagesScroll: () => void
  loadingOlder: boolean
  messagesContentRef: MutableRefObject<HTMLDivElement | null>
  threadLoading: boolean
  timelineMessages: DirectMessage[]
  reactionsByTargetId: Map<string, DirectMessage[]>
  messages: DirectMessage[]
  userId: string | undefined
  onMentionSlugOpenProfile: (slug: string) => void | Promise<void>
  scrollToQuotedMessage: (id: string) => void
  bindMessageAnchor: (messageId: string, el: HTMLElement | null) => void
  messageMenu: { message: DirectMessage; mode: 'kebab' | 'context'; anchorX: number; anchorY: number } | null
  setMessageMenu: Dispatch<
    SetStateAction<{
      message: DirectMessage
      mode: 'kebab' | 'context'
      anchorX: number
      anchorY: number
    } | null>
  >
  closeMessageActionMenu: () => void
  setMessengerImageLightbox: (v: { urls: string[]; index: number } | null) => void
  bumpScrollIfPinned: () => void
  toggleMessengerReaction: (messageId: string, emoji: ReactionEmoji) => void | Promise<void>
  setReplyTo: (m: DirectMessage | null) => void
  composerTextareaRef: MutableRefObject<HTMLTextAreaElement | null>
  showDmJump: boolean
  jumpDmBottom: () => void
  composer: ReactNode
  messageActionMenu: ReactNode
  onForwardSourceNavigate?: (nav: MessengerForwardNav) => void
  bookmarksCount: number
  /** Новые закладки от собеседника (пока модалка не открыта). */
  bookmarksPeerNewCount?: number
  onOpenBookmarks: () => void
}) {
  useDevRenderTrace('MessengerDirectThreadBody', {
    isMobileMessenger: props.isMobileMessenger,
    activeConversationId: props.threadHeadConversation?.id ?? '',
    threadLoading: props.threadLoading,
    messagesLen: props.messages?.length ?? 0,
  })
  const {
    isMobileMessenger,
    navigate,
    totalOtherUnread,
    directPeerLastReadAt,
    viewerDmReceiptsPrivate,
    peerDmReceiptsPrivate,
    threadHeadConversation,
    directPeerPresenceDisplay = 'offline',
    directPeerLastActivityAt = null,
    directPeerShowLastActivity = true,
    openUserPeek,
    user,
    profile,
    activeAvatarUrl,
    isMemberOfActiveConversation,
    goCreateRoomFromMessenger,
    messagesScrollRef,
    readTailRef,
    onMessagesScroll,
    loadingOlder,
    messagesContentRef,
    threadLoading,
    timelineMessages,
    reactionsByTargetId,
    messages,
    userId,
    onMentionSlugOpenProfile,
    scrollToQuotedMessage,
    bindMessageAnchor,
    messageMenu,
    setMessageMenu,
    closeMessageActionMenu,
    setMessengerImageLightbox,
    bumpScrollIfPinned,
    toggleMessengerReaction,
    setReplyTo,
    composerTextareaRef,
    showDmJump,
    jumpDmBottom,
    composer,
    messageActionMenu,
    onForwardSourceNavigate,
    bookmarksCount,
    bookmarksPeerNewCount = 0,
    onOpenBookmarks,
  } = props

  const peerPresenceRingClass =
    directPeerPresenceDisplay === 'in_call'
      ? ' dashboard-messenger__avatar-ring-wrap--in-room'
      : directPeerPresenceDisplay === 'online'
        ? ' dashboard-messenger__avatar-ring-wrap--online'
        : ''

  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const isSavedSelfChat = threadHeadConversation.title.trim().toLowerCase() === 'сохраненное' && !threadHeadConversation.otherUserId?.trim()

  return (
    <>
      <div className="dashboard-messenger__thread-head">
        {isMobileMessenger ? (
          <header className="dashboard-messenger__list-head dashboard-messenger__list-head--thread">
            <div className="dashboard-messenger__thread-head-back-wrap">
              <button
                type="button"
                className="dashboard-messenger__list-head-btn"
                aria-label="К списку чатов"
                title="К списку чатов"
                onClick={() => navigate('/dashboard/messenger?view=list', { replace: true })}
              >
                <ChevronLeftIcon />
              </button>
              {totalOtherUnread > 0 ? (
                <span className="dashboard-messenger__back-badge dashboard-messenger__back-badge--thread">
                  {totalOtherUnread > 99 ? '99+' : totalOtherUnread}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--tappable"
              aria-label="Профиль собеседника"
              onClick={() => {
                const oid = threadHeadConversation.otherUserId?.trim()
                if (oid) {
                  openUserPeek({
                    userId: oid,
                    displayName: threadHeadConversation.title,
                    avatarUrl: activeAvatarUrl,
                  })
                } else if (user?.id) {
                  openUserPeek({
                    userId: user.id,
                    displayName: profile?.display_name ?? threadHeadConversation.title,
                    avatarUrl: profile?.avatar_url ?? null,
                  })
                }
              }}
            >
              <span className={`dashboard-messenger__avatar-ring-wrap${peerPresenceRingClass}`} aria-hidden>
                <span className="dashboard-messenger__thread-head-center-avatar">
                  {isSavedSelfChat ? (
                    <FiRrIcon name="disk" />
                  ) : activeAvatarUrl ? (
                    <StorageOrHttpAvatarImg
                      src={activeAvatarUrl}
                      alt=""
                      fallback={<span>{conversationInitial(threadHeadConversation.title)}</span>}
                    />
                  ) : (
                    <span>{conversationInitial(threadHeadConversation.title)}</span>
                  )}
                </span>
              </span>
              <div className="dashboard-messenger__thread-head-center-text">
                <div
                  className="dashboard-messenger__thread-head-center-title dashboard-messenger__thread-head-center-title--row"
                  role="heading"
                  aria-level={3}
                >
                  <span className="dashboard-messenger__thread-head-center-title-text">
                    {threadHeadConversation.title}
                  </span>
                </div>
                <div
                  className={`dashboard-messenger__thread-head-center-meta${
                    isMemberOfActiveConversation &&
                    !threadHeadConversation.joinRequestPending &&
                    threadHeadConversation.unreadCount > 0
                      ? ' dashboard-messenger__thread-head-center-meta--has-unread'
                      : ''
                  }`}
                >
                  {formatMessengerListRowTime(threadHeadConversation.lastMessageAt ?? threadHeadConversation.createdAt)}
                  {isMemberOfActiveConversation &&
                  !threadHeadConversation.joinRequestPending &&
                  threadHeadConversation.unreadCount > 0 ? (
                    <span
                      className="dashboard-messenger__row-badge dashboard-messenger__row-badge--float"
                      aria-label={`Непрочитано: ${threadHeadConversation.unreadCount}`}
                    >
                      {threadHeadConversation.unreadCount > 99 ? '99+' : threadHeadConversation.unreadCount}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
            <div className="dashboard-messenger__list-head-actions">
              {bookmarksCount > 0 ? (
                <button
                  type="button"
                  className="dashboard-messenger__list-head-btn"
                  onClick={onOpenBookmarks}
                  aria-label="Закладки"
                  title="Закладки"
                >
                  <FiRrIcon name="bookmark" />
                  {bookmarksPeerNewCount > 0 ? (
                    <span className="dashboard-messenger__bookmark-badge dashboard-messenger__row-badge" aria-label="Новые закладки">
                      {bookmarksPeerNewCount > 99 ? '99+' : bookmarksPeerNewCount}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <button
                type="button"
                className="dashboard-messenger__list-head-btn dashboard-messenger__list-head-btn--primary"
                onClick={() => goCreateRoomFromMessenger()}
                aria-label="Новая комната"
                title="Новая комната"
              >
                <FiRrIcon name="circle-phone" />
              </button>
            </div>
          </header>
        ) : (
          <div className="dashboard-messenger__thread-head-main-desktop">
            <button
              type="button"
              className="dashboard-messenger__thread-head-main dashboard-messenger__thread-head-main--tappable"
              aria-label="Профиль в диалоге"
              onClick={() => {
                const oid = threadHeadConversation.otherUserId?.trim()
                if (oid) {
                  openUserPeek({
                    userId: oid,
                    displayName: threadHeadConversation.title,
                    avatarUrl: activeAvatarUrl,
                  })
                } else if (user?.id) {
                  openUserPeek({
                    userId: user.id,
                    displayName: profile?.display_name ?? threadHeadConversation.title,
                    avatarUrl: profile?.avatar_url ?? null,
                  })
                }
              }}
            >
              <span
                className={`dashboard-messenger__avatar-ring-wrap dashboard-messenger__avatar-ring-wrap--thread${peerPresenceRingClass}`}
                aria-hidden
              >
                <span className="dashboard-messenger__thread-avatar">
                  {isSavedSelfChat ? (
                    <FiRrIcon name="disk" />
                  ) : activeAvatarUrl ? (
                    <StorageOrHttpAvatarImg
                      src={activeAvatarUrl}
                      alt=""
                      fallback={<span>{conversationInitial(threadHeadConversation.title)}</span>}
                    />
                  ) : (
                    <span>{conversationInitial(threadHeadConversation.title)}</span>
                  )}
                </span>
              </span>
              <div>
                <div className="dashboard-messenger__thread-titleline">
                  <div className="dashboard-messenger__thread-title-with-dot">
                    <div className="dashboard-section__subtitle" role="heading" aria-level={3}>
                      {threadHeadConversation.title}
                    </div>
                  </div>
                  {isMemberOfActiveConversation &&
                  !threadHeadConversation.joinRequestPending &&
                  threadHeadConversation.unreadCount > 0 ? (
                    <span className="dashboard-messenger__row-badge">
                      {threadHeadConversation.unreadCount > 99 ? '99+' : threadHeadConversation.unreadCount}
                    </span>
                  ) : null}
                </div>
                <div className="dashboard-messenger__thread-meta">
                  <span>{threadHeadConversation.messageCount} сообщ.</span>
                  {directPeerShowLastActivity ? (
                    <span>
                      Был{'\u00A0'}(а):{' '}
                      {directPeerLastActivityAt ? formatDateTime(directPeerLastActivityAt) : 'Нет данных'}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
            {bookmarksCount > 0 ? (
              <div className="dashboard-messenger__thread-head-actions-desktop">
                <button
                  type="button"
                  className="dashboard-topbar__action dashboard-messenger__bookmark-btn"
                  onClick={onOpenBookmarks}
                  title="Закладки"
                  aria-label="Закладки"
                >
                  <FiRrIcon name="bookmark" />
                  {bookmarksPeerNewCount > 0 ? (
                    <span className="dashboard-messenger__bookmark-badge dashboard-messenger__row-badge" aria-label="Новые закладки">
                      {bookmarksPeerNewCount > 99 ? '99+' : bookmarksPeerNewCount}
                    </span>
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="dashboard-messenger__thread-main">
        <div className="dashboard-messenger__scroll-region-wrap">
          <div
            ref={messagesScrollRef}
            className="dashboard-messenger__messages-scroll app-scroll"
            onScroll={onMessagesScroll}
          >
            {loadingOlder ? (
              <div className="dashboard-messenger__load-older" role="status" aria-live="polite">
                Загрузка истории…
              </div>
            ) : null}
            <div ref={messagesContentRef} className="dashboard-messenger__messages">
              {threadLoading ? (
                <div className="dashboard-messenger__thread-loading" role="status" aria-label="Загрузка диалога…">
                  <BrandLogoLoader size={56} />
                </div>
              ) : timelineMessages.length === 0 ? (
                <div className="dashboard-chats-empty messenger-thread-empty">
                  Напиши первое сообщение в этот чат.
                </div>
              ) : (
                (() => {
                  const nodes: ReactNode[] = []
                  let prevDayKey: string | null = null
                  for (const message of timelineMessages) {
                    const isContent =
                      message.kind !== 'reaction' && message.kind !== 'system' && !message.id.startsWith('local-reaction-')
                    if (isContent) {
                      const dt = new Date(message.createdAt)
                      const dayKey = Number.isNaN(dt.getTime())
                        ? null
                        : `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`
                      if (prevDayKey && dayKey && dayKey !== prevDayKey) {
                        nodes.push(
                          <div key={`${message.id}-day`} className="dashboard-messenger__dm-deleted-plain" aria-hidden>
                            {formatMessengerDaySeparatorLabel(message.createdAt)}
                          </div>,
                        )
                      }
                      if (dayKey) prevDayKey = dayKey
                    }

                    const isOwn = Boolean(userId && message.senderUserId === userId)
                    const isNew = !seenMessageIdsRef.current.has(message.id)
                    if (isNew) seenMessageIdsRef.current.add(message.id)
                    const reactions = reactionsByTargetId.get(message.id) ?? []
                    const { preview: replyPreview, scrollTargetId: replyScrollTargetId } = buildQuotePreview({
                      quoteToMessageId: message.quoteToMessageId ?? null,
                      replyToMessageId: message.replyToMessageId ?? null,
                      replyPreviewStored: message.replyPreview ?? null,
                      messageById: (id) => messages.find((m) => m.id === id),
                      resolveQuotedAvatarUrl: (senderUserId) =>
                        resolveQuotedAvatarForDm(
                          senderUserId,
                          userId,
                          profile?.avatar_url,
                          threadHeadConversation?.kind === 'direct'
                            ? (threadHeadConversation as unknown as DirectConversationSummary)
                            : null,
                        ),
                    })
                    const dmOutgoingReceipt = isSavedSelfChat
                      ? null
                      : directOutgoingReceiptStatus(message, {
                          isOwn,
                          isDirectThread: threadHeadConversation.kind === 'direct',
                          peerLastReadAt: directPeerLastReadAt,
                          viewerReceiptsPrivate: viewerDmReceiptsPrivate,
                          peerReceiptsPrivate: peerDmReceiptsPrivate,
                        })
                    nodes.push(
                      <ThreadMessageBubble
                        key={message.id}
                        message={message}
                        isOwn={isOwn}
                        enterAnim={Boolean(isNew && !isOwn)}
                        dmOutgoingReceipt={dmOutgoingReceipt}
                        dmMutePeerLabels={threadHeadConversation?.kind === 'direct'}
                        reactions={reactions}
                        formatDt={formatDateTime}
                        replyPreview={replyPreview}
                        replyScrollTargetId={replyScrollTargetId}
                        onForwardSourceNavigate={onForwardSourceNavigate}
                        onReplyQuoteNavigate={scrollToQuotedMessage}
                        bindMessageAnchor={bindMessageAnchor}
                        menuOpen={messageMenu?.message.id === message.id}
                        onOpenImageLightbox={(ctx) => {
                          closeMessageActionMenu()
                          setMessengerImageLightbox({ urls: ctx.urls, index: ctx.initialIndex })
                        }}
                        onInlineImageLayout={bumpScrollIfPinned}
                        onReplyThumbLayout={bumpScrollIfPinned}
                        onMentionSlug={onMentionSlugOpenProfile}
                        onMenuButtonClick={(e) => {
                          e.stopPropagation()
                          const r = e.currentTarget.getBoundingClientRect()
                          setMessageMenu((cur) => {
                            if (cur?.message.id === message.id) return null
                            return { message, mode: 'kebab', anchorX: r.right, anchorY: r.top }
                          })
                        }}
                        onBubbleContextMenu={(e) => {
                          e.preventDefault()
                          setMessageMenu((cur) => {
                            if (cur?.message.id === message.id) return null
                            return { message, mode: 'context', anchorX: e.clientX, anchorY: e.clientY }
                          })
                        }}
                        currentUserId={userId ?? null}
                        onReactionChipTap={(targetId, emoji) => {
                          if (!isDirectReactionEmoji(emoji)) return
                          void toggleMessengerReaction(targetId, emoji)
                        }}
                        quickReactEnabled={Boolean(
                          userId &&
                            (message.kind === 'text' || message.kind === 'image' || message.kind === 'audio') &&
                            !message.id.startsWith('local-'),
                        )}
                        isMobileMessenger={isMobileMessenger}
                        onQuickHeart={() => void toggleMessengerReaction(message.id, QUICK_REACTION_EMOJI)}
                        swipeReplyEnabled={isMobileMessenger}
                        onSwipeReply={(m) => {
                          setReplyTo(m)
                          closeMessageActionMenu()
                          queueMicrotask(() => composerTextareaRef.current?.focus())
                        }}
                      />,
                    )
                  }
                  return nodes
                })()
              )}
              {readTailRef ? (
                <div ref={readTailRef as Ref<HTMLDivElement>} className="dashboard-messenger__read-tail-sentinel" aria-hidden />
              ) : null}
            </div>
          </div>
          <MessengerJumpToBottomFab visible={showDmJump} onClick={jumpDmBottom} />
        </div>

        {composer}
      </div>

      {messageActionMenu}
    </>
  )
}

export const MessengerDirectThreadBody = memo(MessengerDirectThreadBodyImpl)
