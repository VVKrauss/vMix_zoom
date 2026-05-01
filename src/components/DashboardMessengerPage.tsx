import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { isMessengerSoundEnabled, playMessageSound, setMessengerSoundEnabled } from '../lib/messengerSound'
import { useStableMobileMessenger } from '../hooks/useStableMobileMessenger'
import { useEphemeralErrorToast } from '../hooks/useEphemeralErrorToast'
import { useMessengerPinnedChatsSync } from '../hooks/useMessengerPinnedChatsSync'
import { useMessengerWebPushState } from '../hooks/useMessengerWebPushState'
import { useMessengerSenderContacts } from '../hooks/useMessengerSenderContacts'
import { useMessengerSidebarMergedItems } from '../hooks/useMessengerSidebarMergedItems'
import { useMessengerConversationAvatarUrls } from '../hooks/useMessengerConversationAvatarUrls'
import { useMessengerInvitePreview } from '../hooks/useMessengerInvitePreview'
import { useMessengerRouteSegmentQuerySync } from '../hooks/useMessengerRouteSegmentQuerySync'
import { useMessengerConversationNotificationMutes } from '../hooks/useMessengerConversationNotificationMutes'
import { useMessengerListBootstrap } from '../hooks/useMessengerListBootstrap'
import { useMessengerThreadVM } from '../hooks/useMessengerThreadVM'
import { useMessengerActiveThreadMembership } from '../hooks/useMessengerActiveThreadMembership'
import { useMessengerStaffJoinQueue } from '../hooks/useMessengerStaffJoinQueue'
import {
  useMessengerLastOpenPersist,
  useMessengerPendingPhotosReset,
  useMessengerPinnedBottomReset,
  useMessengerResizeScrollTailCatchup,
} from '../hooks/useMessengerThreadLayoutEffects'
import { useMessengerPerConversationDraft } from '../hooks/useMessengerPerConversationDraft'
import { useMessengerDirectThreadRealtime } from '../hooks/useMessengerDirectThreadRealtime'
import { useMessengerBackgroundMessageSidebar } from '../hooks/useMessengerBackgroundMessageSidebar'
import { useMessengerSelfMembershipDeleteRealtime } from '../hooks/useMessengerSelfMembershipDeleteRealtime'
import {
  useMessengerScrollAfterThreadLoad,
  useMessengerScrollOnMessageGrowth,
} from '../hooks/useMessengerThreadScrollCatchup'
import { useMessengerActiveConversationPublic } from '../hooks/useMessengerActiveConversationPublic'
import { useMessengerGlobalTreeSearch } from '../hooks/useMessengerGlobalTreeSearch'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useMessengerMessageMenuPopoverLayout } from '../hooks/useMessengerMessageMenuPopoverLayout'
import { useMobileMessengerComposerHeight } from '../hooks/useMobileMessengerComposerHeight'
import { useMessengerPendingJumpToQuoted } from '../hooks/useMessengerPendingJumpToQuoted'
import { useConversationInfoStaffLoad } from '../hooks/useConversationInfoStaffLoad'
import { useProfile } from '../hooks/useProfile'
import { useToast } from '../context/ToastContext'
import {
  appendDirectMessage,
  editDirectMessage,
  type DirectConversationSummary,
  type DirectMessage,
  type MessengerForwardNav,
  ensureDirectConversationWithUser,
  ensureSelfDirectConversation,
  getDirectConversationForUser,
  isDirectReactionEmoji,
  listDirectMessagesPage,
  mapDirectMessageFromRow,
  deleteDirectMessage,
  directOutgoingReceiptStatus,
  fetchDirectPeerDmReceiptContext,
  mergePeerLastReadAt,
  previewTextForDirectMessageTail,
  requestMessengerUnreadRefresh,
  MESSENGER_CONTACT_ALIAS_CHANGED_EVENT,
  toggleDirectMessageReaction,
  uploadMessengerImage,
  uploadMessengerAudio,
  isDmSoftDeletedStub,
} from '../lib/messenger'
import {
  buildJoinRequestPendingSidebarStub,
  listMessengerConversationsWithContactAliases,
  type MessengerConversationKind,
  type MessengerConversationSummary,
  type OpenPublicConversationSearchHit,
} from '../lib/messengerConversations'
import {
  MESSENGER_JOIN_REQUEST_MANAGER_ROLES,
  MESSENGER_BOTTOM_PIN_PX,
  MESSENGER_PHOTO_INPUT_MAX_BYTES,
  QUICK_REACTION_EMOJI,
  DM_PAGE_SIZE,
  MESSENGER_GALLERY_MAX_ATTACH,
  buildMessengerUrl,
  conversationInitial,
  isMessengerClosedGroupOrChannel,
  copyTextToClipboard,
  extractClipboardImageFiles,
  formatDateTime,
  itemMatchesMessengerListSearch,
  lastNonReactionBody,
  normalizeMessengerListSearch,
  pickDefaultConversationId,
  sortDirectMessagesChrono,
  buildMessengerForwardNav,
} from '../lib/messengerDashboardUtils'
import { useLinkPreviewFromText } from '../hooks/useLinkPreviewFromText'
import { buildLinkMetaForMessageBody, ensureLinkPreviewForBody } from '../lib/linkPreview'
import { MESSENGER_MAX_PINNED_CHATS, sortMessengerListWithPins } from '../lib/messengerPins'
import { markMessengerConversationRead } from '../lib/messengerMarkRead'
import { resolveMediaUrlForStoragePath } from '../lib/mediaCache'
import {
  listConversationStaffMembers,
  setConversationMemberStaffRole,
  type ConversationStaffMember,
  type ConversationStaffRole,
} from '../lib/conversationStaff'
import { listConversationMembersForManagement, removeConversationMemberByStaff, type ConversationMemberRow } from '../lib/conversationMembers'
import {
  createGroupChat,
  getOrCreateConversationInvite,
  joinConversationByInvite,
  leaveGroupChat,
  joinPublicGroupChat,
  updateGroupProfile,
  type InviteConversationPreview,
} from '../lib/groups'
import { createChannel, joinPublicChannel, leaveChannel, updateChannelProfile } from '../lib/channels'
import {
  getMessengerFontPreset,
  resolveQuotedAvatarForDm,
  setMessengerFontPreset,
  type MessengerFontPreset,
} from '../lib/messengerUi'
import {
  approveConversationJoinRequest,
  denyConversationJoinRequest,
  listConversationJoinRequests,
  requestConversationJoin,
  type ConversationJoinRequest,
} from '../lib/chatRequests'
import { setPendingHostClaim, stashSpaceRoomCreateOptions } from '../lib/spaceRoom'
import { setContactPin, type RegisteredUserSearchHit } from '../lib/socialGraph'
import {
  getMyConversationNotificationMutes,
  setConversationNotificationsMuted,
} from '../lib/conversationNotifications'
import {
  deleteDirectConversationForAllClient,
  deleteOwnedGroupOrChannelClient,
  leaveDirectConversationClient,
  leaveGroupOrChannelClient,
} from '../lib/messengerConversationLifecycle'
import { supabase } from '../lib/supabase'
import { fetchPublicUserProfile } from '../lib/userPublicProfile'
import { writeMessengerThreadTailCache } from '../lib/messengerThreadTailCache'
import { newRoomId } from '../utils/roomId'
import { normalizeProfileSlug } from '../lib/profileSlug'
import { BrandLogoLoader } from './BrandLogoLoader'
import { ChevronLeftIcon, FiRrIcon, JoinRequestsIcon } from './icons'
import { useMessengerJumpToBottom } from '../hooks/useMessengerJumpToBottom'
import { useMessengerThreadReadCoordinator } from '../hooks/useMessengerThreadReadCoordinator'
import { useNavigatorOnline } from '../hooks/useNavigatorOnline'
import { DashboardShell } from './DashboardShell'
import { MessengerForwardToDmModal } from './MessengerForwardToDmModal'
import { MessengerMessageMenuPopover } from './MessengerMessageMenuPopover'
import type { ReactionEmoji } from '../types/roomComms'
import { bookmarkMessage, countMessageBookmarks, listMessageBookmarks } from '../lib/messengerBookmarks'
import { DirectThreadPane } from './messenger/DirectThreadPane'
import { GroupThreadPane } from './messenger/GroupThreadPane'
import { ChannelThreadPane } from './messenger/ChannelThreadPane'
import { MessengerThreadComposer } from './messenger/MessengerThreadComposer'
import { MessengerConversationInfoModal } from './messenger/MessengerConversationInfoModal'
import { MessengerCreateConversationModal } from './messenger/MessengerCreateConversationModal'
import { MessengerImageLightbox } from './messenger/MessengerImageLightbox'
import { MessengerJoinRequestsModal } from './messenger/MessengerJoinRequestsModal'
import { MessengerSettingsModal } from './messenger/MessengerSettingsModal'
import { MessengerChatListAside } from './messenger/MessengerChatListAside'
import { MessengerClosedGcLockBadge } from './messenger/MessengerClosedGcLockBadge'
import { MessengerNetStrip } from './messenger/MessengerNetStrip'
import { MessengerDeleteChatDialog } from './messenger/MessengerDeleteChatDialog'
import { MessengerChatListRowMenuPortal } from './messenger/MessengerChatListRowMenuPortal'
import { MessengerDmMessageMenuPortal } from './messenger/MessengerDmMessageMenuPortal'
import { MessengerDirectThreadBody, type MessengerDirectThreadHeadConversation } from './messenger/MessengerDirectThreadBody'
import { MessengerBookmarkScopeDialog } from './messenger/MessengerBookmarkScopeDialog'
import { MessengerBookmarksModal } from './messenger/MessengerBookmarksModal'
import { devMark, useDevRenderTrace } from '../lib/devTrace'
import { useMessengerSidebarDirectPeersOnline } from '../hooks/useMessengerSidebarDirectPeersOnline'
import { markMyMentionsRead } from '../lib/messengerMentions'
import { saveMessageToSelfConversation } from '../lib/messengerSaved'

export function DashboardMessengerPage() {
  useDevRenderTrace('DashboardMessengerPage')
  const toast = useToast()
  const { conversationId: rawConversationId } = useParams<{ conversationId?: string }>()
  const routeConversationId = rawConversationId?.trim() ?? ''
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const searchConversationId = searchParams.get('chat')?.trim() ?? ''
  const inviteToken = searchParams.get('invite')?.trim() ?? ''
  const urlConversationId = searchConversationId || routeConversationId
  const targetUserId = searchParams.get('with')?.trim() ?? ''
  const targetTitle = searchParams.get('title')?.trim() ?? ''
  const jumpMsgFromUrl = searchParams.get('msg')?.trim() ?? ''
  const jumpPostFromUrl = searchParams.get('post')?.trim() ?? ''
  const navigate = useNavigate()

  useEffect(() => {
    devMark('messenger.route_changed', { routeConversationId, searchConversationId, urlConversationId })
  }, [routeConversationId, searchConversationId, urlConversationId])
  useMessengerRouteSegmentQuerySync({
    routeConversationId,
    searchConversationId,
    targetUserId,
    targetTitle,
    preserveMessageId: jumpMsgFromUrl || undefined,
    preserveParentMessageId: jumpPostFromUrl || undefined,
    navigate,
  })
  const { signOut, user } = useAuth()
  const { openUserPeek } = useUserPeek()
  const { profile } = useProfile()
  const { pinnedChatIds, setPinnedChatIds } = useMessengerPinnedChatsSync(user?.id, profile, toast)
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const isMobileMessenger = useStableMobileMessenger(900)
  const { isOnline, netBanner } = useNavigatorOnline()
  const [soundEnabled, setSoundEnabled] = useState(() => isMessengerSoundEnabled())
  const [messengerFontPreset, setMessengerFontPresetState] = useState<MessengerFontPreset>(() =>
    getMessengerFontPreset(),
  )
  const [messengerSettingsOpen, setMessengerSettingsOpen] = useState(false)
  const [messengerDeleteUi, setMessengerDeleteUi] = useState<
    | null
    | { step: 'dm-pick' }
    | { step: 'confirm'; kind: 'dm-me' | 'dm-all' | 'leave-group' | 'leave-channel' | 'purge-gc' }
  >(null)
  const [deleteChatBusy, setDeleteChatBusy] = useState(false)
  /** Если удаление запущено из дерева чатов — id цели; иначе используется активный тред. */
  const [deleteFlowConversationId, setDeleteFlowConversationId] = useState<string | null>(null)
  const [chatListSearch, setChatListSearch] = useState('')
  const [chatListGlobalUsers, setChatListGlobalUsers] = useState<RegisteredUserSearchHit[]>([])
  const [chatListGlobalOpen, setChatListGlobalOpen] = useState<OpenPublicConversationSearchHit[]>([])
  const [chatListGlobalLoading, setChatListGlobalLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createKind, setCreateKind] = useState<'group' | 'channel'>('group')
  const [createIsOpen, setCreateIsOpen] = useState(true)
  const [createTitle, setCreateTitle] = useState('')
  const [createNick, setCreateNick] = useState('')
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null)
  const [createChannelComments, setCreateChannelComments] = useState<'comments' | 'reactions_only'>('comments')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [dmBookmarkScopePick, setDmBookmarkScopePick] = useState<null | { messageId: string }>(null)
  const [dmBookmarkBusy, setDmBookmarkBusy] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [bookmarksCount, setBookmarksCount] = useState(0)
  const [bookmarksPeerNewCount, setBookmarksPeerNewCount] = useState(0)
  const [inviteJoinBusy, setInviteJoinBusy] = useState(false)
  /** Есть цель для треда (deep link): при view=list всё равно показываем чат, а не только дерево. */
  const hasMobileOpenTarget =
    Boolean(inviteToken.trim()) ||
    Boolean(searchConversationId.trim()) ||
    Boolean(routeConversationId.trim()) ||
    Boolean(targetUserId.trim()) ||
    Boolean(jumpMsgFromUrl)
  /** Мобильный режим «только дерево» — только если явно view=list и в URL нет chat/invite/with/сегмента диалога */
  const listOnlyMobile =
    isMobileMessenger && searchParams.get('view') === 'list' && !hasMobileOpenTarget

  const [loading, setLoading] = useState(true)
  const [chatListRefreshing, setChatListRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { pushUi, pushBusy, refreshPushUi, toggleMessengerPush } = useMessengerWebPushState(user?.id, setError)
  const [items, setItems] = useState<MessengerConversationSummary[]>([])
  const { mutedConversationIds, setMutedConversationIds, mutedConversationIdsRef } =
    useMessengerConversationNotificationMutes(user?.id, items)
  const {
    invitePreview,
    inviteLoading,
    inviteError,
    setInviteError,
  } = useMessengerInvitePreview({ inviteToken, userId: user?.id, items, navigate })
  const conversationId = inviteToken && invitePreview?.id ? invitePreview.id : urlConversationId
  const [chatListRowMenu, setChatListRowMenu] = useState<{
    item: MessengerConversationSummary
    anchor: { left: number; top: number; right: number; bottom: number }
  } | null>(null)
  /** Чаты с отправленной заявкой: держим строку в дереве до появления в ответе сервера. */
  const [pendingJoinSidebarById, setPendingJoinSidebarById] = useState<
    Record<string, MessengerConversationSummary>
  >({})
  const { mergedItems, mergedItemsRef } = useMessengerSidebarMergedItems(
    items,
    pendingJoinSidebarById,
    setPendingJoinSidebarById,
  )
  const [chatListAvatarPullEpoch, setChatListAvatarPullEpoch] = useState(0)
  const conversationAvatarUrlById = useMessengerConversationAvatarUrls(mergedItems, chatListAvatarPullEpoch)
  /** Курсор прочтения собеседника в открытом ЛС + приватность квитанций (индикаторы исходящих). */
  const [directPeerLastReadAt, setDirectPeerLastReadAt] = useState<string | null>(null)
  const [directPeerReceiptsPrivate, setDirectPeerReceiptsPrivate] = useState(false)
  const [directPeerLastActivityAt, setDirectPeerLastActivityAt] = useState<string | null>(null)
  const [directPeerShowLastActivity, setDirectPeerShowLastActivity] = useState(true)

  const [conversationInfoOpen, setConversationInfoOpen] = useState(false)
  const [conversationInfoId, setConversationInfoId] = useState<string | null>(null)
  const [conversationInfoRole, setConversationInfoRole] = useState<string | null>(null)
  const [conversationInfoLoading, setConversationInfoLoading] = useState(false)
  const [conversationInfoEdit, setConversationInfoEdit] = useState(false)
  const [conversationInfoError, setConversationInfoError] = useState<string | null>(null)
  const [conversationInfoTitle, setConversationInfoTitle] = useState('')
  const [conversationInfoNick, setConversationInfoNick] = useState('')
  const [conversationInfoIsOpen, setConversationInfoIsOpen] = useState(true)
  const [conversationInfoChannelComments, setConversationInfoChannelComments] = useState<'comments' | 'reactions_only'>('comments')
  const [conversationInfoLogoFile, setConversationInfoLogoFile] = useState<File | null>(null)
  const [conversationInfoNotificationsMuted, setConversationInfoNotificationsMuted] = useState(false)
  const [conversationInfoNotificationsBusy, setConversationInfoNotificationsBusy] = useState(false)
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [conversationStaffRows, setConversationStaffRows] = useState<ConversationStaffMember[]>([])
  const [conversationStaffLoading, setConversationStaffLoading] = useState(false)
  const [conversationStaffTargetUserId, setConversationStaffTargetUserId] = useState('')
  const [conversationStaffNewRole, setConversationStaffNewRole] = useState<ConversationStaffRole>('moderator')
  const [conversationStaffMutating, setConversationStaffMutating] = useState(false)
  const [sending, setSending] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [voiceUploading, setVoiceUploading] = useState(false)
  /** Локальные файлы до отправки (подпись — в поле draft). */
  const [pendingMessengerPhotos, setPendingMessengerPhotos] = useState<
    { id: string; file: File; previewUrl: string }[]
  >([])
  /** Ответ на сообщение (цитата над композером). */
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  /** Редактирование своего сообщения: id сообщения. */
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  /** Меню «⋯» у сообщения: якорь и данные для поповера */
  const [messageMenu, setMessageMenu] = useState<{
    message: DirectMessage
    mode: 'kebab' | 'context'
    anchorX: number
    anchorY: number
  } | null>(null)
  const [forwardDmModal, setForwardDmModal] = useState<{
    sourceMessage: DirectMessage
    sourceLabel: string
    sourceNav: MessengerForwardNav | null
    excludeConversationId: string
  } | null>(null)
  const [forwardDmComment, setForwardDmComment] = useState('')
  const [forwardDmSending, setForwardDmSending] = useState(false)
  const [forwardDmShowSource, setForwardDmShowSource] = useState(true)
  const [mentionUnreadByConversationId, setMentionUnreadByConversationId] = useState<Record<string, number>>({})
  const [pendingJump, setPendingJump] = useState<{
    conversationId: string
    messageId: string
    parentMessageId?: string | null
    conversationKind?: MessengerConversationKind
    sourceTitle?: string
    sourceAvatarUrl?: string | null
  } | null>(null)

  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId
  const prevThreadIdForClearRef = useRef<string | null>(null)
  /** Уже загруженные сообщения для этого id — не дергать API при повторном срабатывании эффекта (напр. loading). */
  const lastFetchedThreadIdRef = useRef<string | null>(null)
  const {
    vm: threadVM,
    setActiveConversation,
    setMessages,
    setHasMoreOlder,
  } = useMessengerThreadVM({
    userId: user?.id,
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
    mergedItemsRef,
    conversationIdRef,
    lastFetchedThreadIdRef,
    prevThreadIdForClearRef,
    setError,
  })
  const { activeConversation, messages, hasMoreOlder } = threadVM
  const threadLoading = threadVM.phase === 'loading'
  /** Реально открытый тред (URL или загруженный объект) — уведомления и фоновые INSERT. */
  const foregroundThreadConversationId = useMemo(
    () => (conversationId || activeConversation?.id || '').trim(),
    [conversationId, activeConversation?.id],
  )
  const foregroundThreadForMentionsRef = useRef('')
  foregroundThreadForMentionsRef.current = foregroundThreadConversationId
  const dmDraftKey = (conversationId || activeConversation?.id || '').trim()
  const { draft, setDraft, resetDraft } = useMessengerPerConversationDraft(dmDraftKey)
  const {
    preview: draftLinkPreview,
    loading: draftLinkPreviewLoading,
    dismiss: dismissDraftLinkPreview,
  } = useLinkPreviewFromText(draft, {
    enabled: !editingMessageId && pendingMessengerPhotos.length === 0,
  })
  const { senderContactByUserId, setSenderContactByUserId } = useMessengerSenderContacts(user?.id, messages)
  const [conversationJoinRequests, setConversationJoinRequests] = useState<ConversationJoinRequest[]>([])
  const [joinRequestsLoading, setJoinRequestsLoading] = useState(false)
  const [joinRequestsOpen, setJoinRequestsOpen] = useState(false)

  const [conversationMembers, setConversationMembers] = useState<ConversationMemberRow[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [joinRequestInFlight, setJoinRequestInFlight] = useState(false)
  const [kickMemberBusyId, setKickMemberBusyId] = useState<string | null>(null)
  const [pendingJoinRequest, setPendingJoinRequest] = useState<boolean | null>(null)
  const [joinRequestError, setJoinRequestError] = useState<string | null>(null)
  const [activeJoinRequestId, setActiveJoinRequestId] = useState<string | null>(null)
  const [activeConversationRole, setActiveConversationRole] = useState<string | null>(null)
  const [activeConversationRoleLoading, setActiveConversationRoleLoading] = useState(false)
  const [activeConversationIsPublic, setActiveConversationIsPublic] = useState<boolean | null>(null)
  const [activeConversationIsPublicLoading, setActiveConversationIsPublicLoading] = useState(false)
  const msgMenuWrapRef = useRef<HTMLDivElement | null>(null)
  const [messengerImageLightbox, setMessengerImageLightbox] = useState<{ urls: string[]; index: number } | null>(null)
  const [pinBusyUserId, setPinBusyUserId] = useState<string | null>(null)
  /** Снятие реакции уже отразили в списке диалогов после RPC — пропускаем дубль из realtime DELETE. */
  const reactionDeleteSidebarSyncedRef = useRef(new Set<string>())

  useEphemeralErrorToast(error, setError, toast)
  useEphemeralErrorToast(inviteError, setInviteError, toast)
  useEphemeralErrorToast(joinRequestError, setJoinRequestError, toast)

  const joinFromInvite = useCallback(async () => {
    const token = inviteToken.trim()
    if (!user?.id || !token || inviteJoinBusy) return
    setInviteJoinBusy(true)
    setInviteError(null)
    try {
      const res = await joinConversationByInvite(token)
      if (res.error || !res.data?.conversationId) {
        setInviteError(res.error ?? 'Не удалось вступить.')
        return
      }
      // Closed conversations: backend returns requested=true (no membership yet).
      if (res.data.requested) {
        setPendingJoinRequest(true)
        if (invitePreview?.id === res.data.conversationId) {
          setPendingJoinSidebarById((prev) => ({
            ...prev,
            [invitePreview.id]: buildJoinRequestPendingSidebarStub({
              id: invitePreview.id,
              kind: invitePreview.kind,
              title: invitePreview.title,
              isPublic: invitePreview.isPublic,
              publicNick: invitePreview.publicNick,
              avatarPath: invitePreview.avatarPath,
              avatarThumbPath: invitePreview.avatarThumbPath,
              memberCount: invitePreview.memberCount,
              postingMode: invitePreview.postingMode,
              commentsMode: invitePreview.commentsMode,
            }),
          }))
        }
        toast.push({ tone: 'success', message: 'Запрос на вступление отправлен. Ожидайте подтверждения.', ms: 3200 })
        navigate(`/dashboard/messenger/${encodeURIComponent(res.data.conversationId)}`, { replace: true })
        return
      }
      const listRes = await listMessengerConversationsWithContactAliases()
      if (!listRes.error && listRes.data) setItems(listRes.data)
      navigate(`/dashboard/messenger/${encodeURIComponent(res.data.conversationId)}`, { replace: true })
    } finally {
      setInviteJoinBusy(false)
    }
  }, [inviteJoinBusy, invitePreview, inviteToken, navigate, setItems, setPendingJoinRequest, toast, user?.id])

  const itemsRef = useRef(items)
  itemsRef.current = items

  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  /** Только смена диалога: иначе каждое сообщение пересоздаёт подписки jump-to-bottom и лишний layout. */
  const dmJumpKey = conversationId || ''
  const { showJump: showDmJump, jumpToBottom: jumpDmBottom } = useMessengerJumpToBottom(
    messagesScrollRef,
    dmJumpKey,
    messages.length,
  )
  /** Контейнер с сообщениями — ResizeObserver ловит рост высоты после decode изображений. */
  const messagesContentRef = useRef<HTMLDivElement | null>(null)
  const messageAnchorRef = useRef<Map<string, HTMLElement>>(new Map())
  /** Пользователь у нижней границы ленты (обновляется в onScroll). */
  const messengerPinnedToBottomRef = useRef(true)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composerEmojiWrapRef = useRef<HTMLDivElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const olderFetchInFlightRef = useRef(false)
  const dmReadTailRef = useRef<HTMLDivElement | null>(null)
  const chatListRefreshInFlightRef = useRef(false)

  const refreshChatList = useCallback(async () => {
    if (!user?.id || chatListRefreshInFlightRef.current) return
    chatListRefreshInFlightRef.current = true
    setChatListRefreshing(true)
    setError(null)
    try {
      const listRes = await listMessengerConversationsWithContactAliases()
      if (listRes.error) {
        setError(listRes.error)
        return
      }
      if (listRes.data) {
        setItems(listRes.data)
        setChatListAvatarPullEpoch((e) => e + 1)
      }
    } finally {
      chatListRefreshInFlightRef.current = false
      setChatListRefreshing(false)
    }
  }, [user?.id])

  useEffect(() => {
    const onAlias = () => {
      void refreshChatList()
    }
    window.addEventListener(MESSENGER_CONTACT_ALIAS_CHANGED_EVENT, onAlias)
    return () => window.removeEventListener(MESSENGER_CONTACT_ALIAS_CHANGED_EVENT, onAlias)
  }, [refreshChatList])

  const updateMessengerScrollPinned = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el) return
    messengerPinnedToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < MESSENGER_BOTTOM_PIN_PX
  }, [])

  /** Догон низа после decode картинки / смены высоты пузыря, если пользователь был у хвоста. */
  const bumpScrollIfPinned = useCallback(() => {
    requestAnimationFrame(() => {
      if (!messengerPinnedToBottomRef.current) return
      const el = messagesScrollRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
  }, [])

  const mergeLatestPageIntoMessages = useCallback((convId: string, page: DirectMessage[]) => {
    setMessages((prev) => {
      if (conversationIdRef.current.trim() !== convId) return prev
      const seen = new Set(prev.map((m) => m.id))
      const next = [...prev]
      for (const m of page) {
        if (!seen.has(m.id)) {
          seen.add(m.id)
          next.push(m)
        }
      }
      next.sort(sortDirectMessagesChrono)
      return next
    })
  }, [])

  const selectConversation = (nextConversationId: string) => {
    navigate(buildMessengerUrl(nextConversationId), { replace: false })
  }

  useMessengerListBootstrap({
    userId: user?.id,
    isMobileMessenger,
    navigate,
    routeConversationId,
    searchConversationId,
    searchParams,
    hasMobileOpenTarget,
    inviteToken,
    invitePreviewId: invitePreview?.id,
    inviteError,
    targetUserId,
    targetTitle,
    conversationIdRef,
    lastFetchedThreadIdRef,
    prevThreadIdForClearRef,
    setItems,
    setActiveConversation,
    setMessages,
    setLoading,
    setError,
  })

  const sidebarActiveConversationId = listOnlyMobile ? '' : conversationId || activeConversation?.id || ''
  /** Для эффектов/догонов хвоста/secondary side-effects: отключаем пока VM в loading/error. */
  const activeConversationId = listOnlyMobile || threadVM.phase !== 'ready' ? '' : sidebarActiveConversationId

  // Mentions: in-app уведомления + бейджи (override mute делается на push-слое).
  useEffect(() => {
    const uid = user?.id?.trim() ?? ''
    if (!uid) return
    const channel = supabase
      .channel(`mentions-${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_message_mentions',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const cid = typeof row.conversation_id === 'string' ? row.conversation_id.trim() : ''
          if (!cid) return
          if (cid === foregroundThreadForMentionsRef.current.trim()) return
          setMentionUnreadByConversationId((prev) => ({ ...prev, [cid]: (prev[cid] ?? 0) + 1 }))
          const title = itemsRef.current.find((it) => it.id === cid)?.title?.trim() || 'чат'
          toast.push({ tone: 'info', message: `Вас упомянули в: ${title}`, ms: 3200 })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [toast, user?.id])

  useEffect(() => {
    const cid = foregroundThreadConversationId.trim()
    if (!cid || !user?.id) return
    if (!mentionUnreadByConversationId[cid]) return
    setMentionUnreadByConversationId((prev) => {
      if (!prev[cid]) return prev
      const next = { ...prev }
      delete next[cid]
      return next
    })
    void markMyMentionsRead(cid)
  }, [foregroundThreadConversationId, mentionUnreadByConversationId, user?.id])
  const inviteJoinMode = Boolean(
    inviteToken.trim() &&
      invitePreview?.id &&
      sidebarActiveConversationId === invitePreview.id &&
      !mergedItems.some((i) => i.id === invitePreview.id && !i.joinRequestPending) &&
      invitePreview.isPublic !== true,
  )

  /** Тип текущего открытого чата (из списка), чтобы не вызывать group-only RPC с устаревшей ролью после смены диалога. */
  const activeOpenThreadKind = useMemo((): MessengerConversationKind | null => {
    const id = activeConversationId.trim()
    if (!id) return null
    const fromList = mergedItems.find((i) => i.id === id)
    if (fromList) return fromList.kind
    if (activeConversation?.id === id) return activeConversation.kind
    return null
  }, [activeConversationId, mergedItems, activeConversation])

  /** Тип треда по `conversationId` из маршрута (на мобилке `activeConversationId` может быть пустым). */
  const openRouteThreadKind = useMemo((): MessengerConversationKind | null => {
    const id = conversationId.trim()
    if (!id) return null
    const fromList = mergedItems.find((i) => i.id === id)
    if (fromList) return fromList.kind
    if (activeConversation?.id === id) return activeConversation.kind
    return null
  }, [conversationId, mergedItems, activeConversation])

  useEffect(() => {
    const id = activeConversationId.trim()
    if (!id || activeOpenThreadKind !== 'direct' || !messages.length) return
    const t = window.setTimeout(() => {
      void writeMessengerThreadTailCache('direct', id, messages)
    }, 700)
    return () => window.clearTimeout(t)
  }, [messages, activeConversationId, activeOpenThreadKind])

  const refreshDirectPeerDmReceiptContext = useCallback(() => {
    const cid = activeConversationId.trim()
    if (!cid || !user?.id || activeOpenThreadKind !== 'direct') return
    void fetchDirectPeerDmReceiptContext(cid).then(({ data }) => {
      if (!data) return
      setDirectPeerLastReadAt((p) => mergePeerLastReadAt(p, data.lastReadAt))
      setDirectPeerReceiptsPrivate(data.peerReceiptsPrivate)
    })
  }, [activeConversationId, activeOpenThreadKind, user?.id])

  useEffect(() => {
    setDirectPeerLastReadAt(null)
    setDirectPeerReceiptsPrivate(false)
    const cid = activeConversationId.trim()
    if (!cid || !user?.id || activeOpenThreadKind !== 'direct') return
    let cancelled = false
    void fetchDirectPeerDmReceiptContext(cid).then(({ data }) => {
      if (cancelled || !data) return
      setDirectPeerLastReadAt((p) => mergePeerLastReadAt(p, data.lastReadAt))
      setDirectPeerReceiptsPrivate(data.peerReceiptsPrivate)
    })
    return () => {
      cancelled = true
    }
  }, [activeConversationId, activeOpenThreadKind, user?.id])

  useEffect(() => {
    if (threadLoading || activeOpenThreadKind !== 'direct' || !user?.id) return
    refreshDirectPeerDmReceiptContext()
  }, [threadLoading, activeOpenThreadKind, user?.id, refreshDirectPeerDmReceiptContext])

  useEffect(() => {
    if (activeOpenThreadKind !== 'direct' || !user?.id) return
    const cid = activeConversationId.trim()
    if (!cid) return
    const t = setInterval(() => {
      void fetchDirectPeerDmReceiptContext(cid).then(({ data }) => {
        if (!data) return
        setDirectPeerLastReadAt((p) => mergePeerLastReadAt(p, data.lastReadAt))
        setDirectPeerReceiptsPrivate(data.peerReceiptsPrivate)
      })
    }, 8000)
    return () => clearInterval(t)
  }, [activeConversationId, activeOpenThreadKind, user?.id])

  useEffect(() => {
    if (activeOpenThreadKind !== 'direct' || !user?.id) return
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshDirectPeerDmReceiptContext()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [activeOpenThreadKind, user?.id, refreshDirectPeerDmReceiptContext])

  useEffect(() => {
    const cid = activeConversationId.trim()
    if (!cid || !user?.id || activeOpenThreadKind !== 'direct') return
    const channel = supabase
      .channel(`dm-peer-read:${cid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversation_members',
          filter: `conversation_id=eq.${cid}`,
        },
        (payload) => {
          const row = payload.new as { user_id?: string; last_read_at?: unknown }
          const raw = row.last_read_at
          if (!row.user_id || row.user_id === user.id || raw == null) return
          const s =
            typeof raw === 'string'
              ? raw
              : typeof raw === 'number'
                ? new Date(raw).toISOString()
                : String(raw)
          if (s)
            setDirectPeerLastReadAt((p) => mergePeerLastReadAt(p, s))
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeConversationId, activeOpenThreadKind, user?.id])

  /**
   * Синхронизация прочтения между устройствами:
   * когда на другом девайсе обновился last_read_at в chat_conversation_members,
   * нужно сбросить unreadCount в дереве чатов (и пересчитать бейджи вкладок).
   */
  useEffect(() => {
    const uid = user?.id?.trim() ?? ''
    if (!uid) return
    const channel = supabase
      .channel(`messenger-my-reads:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversation_members',
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const cidRaw = row?.conversation_id
          const cid =
            typeof cidRaw === 'string' ? cidRaw.trim() : cidRaw != null ? String(cidRaw).trim() : ''
          if (!cid) return
          // Если last_read_at не менялся/пустой — не трогаем
          if (row.last_read_at == null) return
          setItems((prev) => prev.map((i) => (i.id === cid ? { ...i, unreadCount: 0 } : i)))
          setActiveConversation((prev) => (prev && prev.id === cid ? { ...prev, unreadCount: 0 } : prev))
          requestMessengerUnreadRefresh()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id])

  useMessengerActiveThreadMembership({
    activeConversationId,
    userId: user?.id,
    setActiveConversationRole,
    setActiveConversationRoleLoading,
    setPendingJoinRequest,
    setJoinRequestError,
  })

  useMessengerStaffJoinQueue({
    activeConversationId,
    userId: user?.id,
    activeConversationRole,
    activeOpenThreadKind,
    setConversationJoinRequests,
    setJoinRequestsLoading,
    setConversationMembers,
    setMembersLoading,
    setJoinRequestError,
  })

  useMessengerPendingPhotosReset(activeConversationId, setPendingMessengerPhotos)
  useMessengerPinnedBottomReset(activeConversationId, listOnlyMobile, messengerPinnedToBottomRef)
  useMessengerLastOpenPersist(activeConversationId, listOnlyMobile)
  useMessengerResizeScrollTailCatchup({
    activeConversationId,
    listOnlyMobile,
    threadLoading,
    messagesContentRef,
    messagesScrollRef,
    messengerPinnedToBottomRef,
  })

  const { adjustMobileComposerHeight } = useMobileMessengerComposerHeight({
    isMobileMessenger,
    draft,
    activeConversationId,
    editingMessageId,
    threadLoading,
    composerTextareaRef,
  })

  /** На мобильных список на весь экран только без открытого чата и без deep link (?chat / invite / with / :id). */
  const showListPane =
    !isMobileMessenger ||
    (!(activeConversationId || '').trim() && !hasMobileOpenTarget)
  const showThreadPane =
    !isMobileMessenger ||
    Boolean((activeConversationId || '').trim()) ||
    hasMobileOpenTarget

  useMessengerDirectThreadRealtime({
    userId: user?.id,
    threadConversationId: conversationId.trim(),
    listOnlyMobile,
    itemsRef,
    setItems,
    setActiveConversation,
    setMessages,
    bumpScrollIfPinned,
    mergeLatestPageIntoMessages,
    mutedConversationIdsRef,
    reactionDeleteSidebarSyncedRef,
  })

  useMessengerBackgroundMessageSidebar({
    userId: user?.id,
    foregroundThreadConversationId,
    mutedConversationIdsRef,
    setItems,
  })

  useMessengerSelfMembershipDeleteRealtime({
    userId: user?.id,
    navigate,
    conversationIdRef,
    setItems,
    setPendingJoinSidebarById,
    setMessages,
    setActiveConversation,
  })

  useMessengerScrollAfterThreadLoad({
    threadLoading,
    listOnlyMobile,
    messagesLength: messages.length,
    messagesScrollRef,
    messagesContentRef,
    conversationIdRef,
    activeConversationId,
    messengerPinnedToBottomRef,
  })
  useMessengerScrollOnMessageGrowth({
    messagesLength: messages.length,
    threadLoading,
    loadingOlder,
    messagesScrollRef,
    messengerPinnedToBottomRef,
  })

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
        updateMessengerScrollPinned()
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
    updateMessengerScrollPinned,
  ])

  const lastOlderScrollInvokeRef = useRef(0)
  const onMessagesScroll = useCallback(() => {
    updateMessengerScrollPinned()
    const el = messagesScrollRef.current
    if (!el || threadLoading || loadingOlder || !hasMoreOlder || olderFetchInFlightRef.current) return
    if (el.scrollTop > 96) return
    const now = Date.now()
    if (now - lastOlderScrollInvokeRef.current < 500) return
    lastOlderScrollInvokeRef.current = now
    void loadOlderMessages()
  }, [threadLoading, loadingOlder, hasMoreOlder, loadOlderMessages, updateMessengerScrollPinned])

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

  const addPendingMessengerPhotoFiles = useCallback(
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
      setPendingMessengerPhotos((prev) => {
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

  const removePendingMessengerPhoto = useCallback((id: string) => {
    setPendingMessengerPhotos((prev) => {
      const cur = prev.find((p) => p.id === id)
      if (cur) URL.revokeObjectURL(cur.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const sendMessage = async () => {
    const trimmed = draft.trim()
    const convId = activeConversationId.trim()
    if (!user?.id || !convId || sending) return

    if (editingMessageId) {
      if (!trimmed) return
      setSending(true)
      const { error: editErr } = await editDirectMessage(convId, editingMessageId, trimmed)
      if (editErr) {
        setError(editErr)
        setSending(false)
        return
      }
      const nowIso = new Date().toISOString()
      setMessages((prev) =>
        prev.map((m) => (m.id === editingMessageId ? { ...m, body: trimmed, editedAt: nowIso } : m)),
      )
      setEditingMessageId(null)
      resetDraft()
      setSending(false)
      queueMicrotask(() => composerTextareaRef.current?.focus())
      return
    }

    const hasPendingPhotos = pendingMessengerPhotos.length > 0
    if (!hasPendingPhotos && !trimmed) return

    const replyTarget = replyTo
    const replyId = replyTarget?.id ?? null

    if (hasPendingPhotos) {
      setSending(true)
      setPhotoUploading(true)
      setError(null)
      const uploaded: Array<{ path: string; thumbPath?: string }> = []
      for (const p of pendingMessengerPhotos) {
        const up = await uploadMessengerImage(convId, p.file)
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

      const res = await appendDirectMessage(convId, trimmed, {
        kind: 'image',
        meta: imageMeta as Record<string, unknown>,
        replyToMessageId: replyId,
      })
      if (res.error) {
        setError(res.error)
        setSending(false)
        setPhotoUploading(false)
        return
      }
      const preview = previewTextForDirectMessageTail({
        kind: 'image',
        body: trimmed,
        meta: imageMeta,
      })
      for (const p of pendingMessengerPhotos) {
        URL.revokeObjectURL(p.previewUrl)
      }
      setPendingMessengerPhotos([])
      resetDraft()
      setReplyTo(null)
      setPhotoUploading(false)
      setSending(false)
      const createdAt = res.data?.createdAt ?? new Date().toISOString()
      const snap = profile?.display_name?.trim() || 'Вы'
      const newMsg: DirectMessage = {
        id: res.data?.messageId ?? `local-${Date.now()}`,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'image',
        body: trimmed,
        createdAt,
        replyToMessageId: replyId,
        meta: imageMeta,
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev
        return [...prev, newMsg].sort(sortDirectMessagesChrono)
      })
      setItems((prev) =>
        prev.map((item) =>
          item.id === convId
            ? {
                ...item,
                lastMessageAt: createdAt,
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
              lastMessageAt: createdAt,
              lastMessagePreview: preview,
              messageCount: prev.messageCount + 1,
              unreadCount: 0,
            }
          : prev,
      )
      requestMessengerUnreadRefresh()
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (el) {
          el.scrollTop = el.scrollHeight
          messengerPinnedToBottomRef.current = true
        }
        refocusMessengerComposer()
      })
      return
    }

    setSending(true)
    const effectiveLinkPreview = await ensureLinkPreviewForBody(trimmed, draftLinkPreview)
    const linkMetaRecord = buildLinkMetaForMessageBody(trimmed, effectiveLinkPreview)
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: 'Вы',
      kind: 'text',
      body: trimmed,
      createdAt: new Date().toISOString(),
      replyToMessageId: replyId,
      ...(linkMetaRecord ? { meta: linkMetaRecord } : {}),
    }
    setMessages((prev) => [...prev, optimistic])
    resetDraft()
    setReplyTo(null)

    const res = await appendDirectMessage(convId, trimmed, {
      replyToMessageId: replyId,
      ...(linkMetaRecord ? { meta: linkMetaRecord as Record<string, unknown> } : {}),
    })
    if (res.error) {
      setError(res.error)
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id))
      setDraft(trimmed)
      if (replyId && replyTarget) setReplyTo(replyTarget)
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
          ? {
              ...optimistic,
              id: finalId,
              createdAt: finalAt,
              senderNameSnapshot: snap,
              replyToMessageId: replyId,
              meta: linkMetaRecord ?? optimistic.meta,
            }
          : m,
      ),
    )

    setItems((prev) =>
      prev.map((item) =>
        item.id === convId
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
      prev && prev.id === convId
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
      if (el) {
        el.scrollTop = el.scrollHeight
        messengerPinnedToBottomRef.current = true
      }
      composerTextareaRef.current?.focus()
    })
  }

  const onVoiceRecorded = useCallback(
    async (blob: Blob, durationSec: number) => {
      const trimmed = draft.trim()
      const convId = activeConversationId.trim()
      if (!user?.id || !convId || sending || voiceUploading || photoUploading) return

      const replyTarget = replyTo
      const replyId = replyTarget?.id ?? null

      setSending(true)
      setVoiceUploading(true)
      setError(null)
      const up = await uploadMessengerAudio(convId, blob)
      if (up.error || !up.path) {
        setError(up.error ?? 'Не удалось загрузить аудио')
        setVoiceUploading(false)
        setSending(false)
        return
      }
      const dur = Math.round(durationSec * 10) / 10
      const audioMeta: DirectMessage['meta'] = {
        audio: { path: up.path, durationSec: dur },
      }
      const res = await appendDirectMessage(convId, trimmed, {
        kind: 'audio',
        meta: audioMeta as Record<string, unknown>,
        replyToMessageId: replyId,
      })
      if (res.error) {
        setError(res.error)
        setVoiceUploading(false)
        setSending(false)
        return
      }
      const preview = previewTextForDirectMessageTail({
        kind: 'audio',
        body: trimmed,
        meta: audioMeta,
      })
      resetDraft()
      setReplyTo(null)
      setVoiceUploading(false)
      setSending(false)
      const createdAt = res.data?.createdAt ?? new Date().toISOString()
      const snap = profile?.display_name?.trim() || 'Вы'
      const newMsg: DirectMessage = {
        id: res.data?.messageId ?? `local-${Date.now()}`,
        senderUserId: user.id,
        senderNameSnapshot: snap,
        kind: 'audio',
        body: trimmed,
        createdAt,
        replyToMessageId: replyId,
        meta: audioMeta,
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev
        return [...prev, newMsg].sort(sortDirectMessagesChrono)
      })
      setItems((prev) =>
        prev.map((item) =>
          item.id === convId
            ? {
                ...item,
                lastMessageAt: createdAt,
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
              lastMessageAt: createdAt,
              lastMessagePreview: preview,
              messageCount: prev.messageCount + 1,
              unreadCount: 0,
            }
          : prev,
      )
      requestMessengerUnreadRefresh()
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current
        if (el) {
          el.scrollTop = el.scrollHeight
          messengerPinnedToBottomRef.current = true
        }
        refocusMessengerComposer()
      })
    },
    [
      draft,
      activeConversationId,
      user?.id,
      sending,
      voiceUploading,
      photoUploading,
      replyTo,
      profile?.display_name,
      setMessages,
      setItems,
      setActiveConversation,
      resetDraft,
      setReplyTo,
      setError,
    ],
  )

  const onComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (threadLoading || photoUploading || voiceUploading || Boolean(editingMessageId)) return
      const files = extractClipboardImageFiles(e.clipboardData)
      if (files.length === 0) return
      e.preventDefault()
      addPendingMessengerPhotoFiles(files)
    },
    [photoUploading, voiceUploading, threadLoading, editingMessageId, addPendingMessengerPhotoFiles],
  )

  const [conversationKindFilter, setConversationKindFilter] = useState<
    'all' | MessengerConversationKind
  >('all')

  const sortedItems = useMemo(
    () => sortMessengerListWithPins(mergedItems, pinnedChatIds),
    [mergedItems, pinnedChatIds],
  )

  const chatListExtraUserIds = useMemo(() => chatListGlobalUsers.map((u) => u.id), [chatListGlobalUsers])
  const directPeersPresence = useMessengerSidebarDirectPeersOnline(user?.id, sortedItems, chatListExtraUserIds)

  /** Сумма непрочитанного по типу беседы — для бейджей на вкладках «Все / ЛС / …». */
  const filterUnreadByKind = useMemo(() => {
    let direct = 0
    let group = 0
    let channel = 0
    for (const it of sortedItems) {
      const u = Math.max(0, Number(it.unreadCount) || 0)
      if (it.kind === 'direct') direct += u
      else if (it.kind === 'group') group += u
      else if (it.kind === 'channel') channel += u
    }
    return { direct, group, channel, all: direct + group + channel }
  }, [sortedItems])

  /** id открытого треда из URL/VM (на мобилке sidebar id пустой — шапка всё равно по этому id). */
  const resolvedThreadConversationId = useMemo(
    () => (conversationId || activeConversation?.id || '').trim(),
    [conversationId, activeConversation?.id],
  )

  /** Шапка треда: из списка; иначе карточка из VM. */
  const threadHeadConversation =
    sortedItems.find((i) => i.id === resolvedThreadConversationId) ?? activeConversation

  useEffect(() => {
    const cid = activeConversationId.trim()
    if (!user?.id || !cid) {
      setBookmarksCount(0)
      setBookmarksPeerNewCount(0)
      return
    }
    void countMessageBookmarks(cid).then((res) => {
      if (res.error || typeof res.data !== 'number') {
        setBookmarksCount(0)
        return
      }
      setBookmarksCount(Math.max(0, res.data))
    })

    const head = threadHeadConversation
    const isPeerDm = Boolean(head?.kind === 'direct' && head.otherUserId?.trim())
    if (!isPeerDm) {
      setBookmarksPeerNewCount(0)
      return
    }

    const seenKey = `vmix:bookmarks-seen:${cid}`
    const seenAt = (typeof window !== 'undefined' ? window.localStorage.getItem(seenKey) : '')?.trim() ?? ''
    const seenMs = seenAt ? Date.parse(seenAt) : 0

    void listMessageBookmarks({ conversationId: cid, limit: 200 }).then((res) => {
      if (res.error || !res.data) return
      const now = Date.now()
      const safeSeenMs = Number.isFinite(seenMs) ? seenMs : 0
      const n = res.data.reduce((acc, r) => {
        const by = r.createdByUserId?.trim() ?? ''
        if (!by || by === user.id) return acc
        const t = Date.parse(r.bookmarkCreatedAt)
        if (!Number.isFinite(t)) return acc
        if (t <= safeSeenMs) return acc
        if (t > now + 30_000) return acc
        return acc + 1
      }, 0)
      setBookmarksPeerNewCount(Math.max(0, n))
    })
  }, [activeConversationId, user?.id, threadHeadConversation?.kind, threadHeadConversation?.otherUserId])

  const saveMessageFromActiveConversation = useCallback(
    async (message: DirectMessage, ctx?: { channelParentPostId?: string | null }) => {
      const cid = activeConversationId.trim()
      if (!user?.id || !cid) return
      const kind = threadHeadConversation?.kind
      if (kind !== 'direct' && kind !== 'group' && kind !== 'channel') return

      const title = threadHeadConversation?.title?.trim() || 'Чат'

      const source =
        kind === 'direct'
          ? ({ kind: 'direct', conversationId: cid, title, messageId: message.id } as const)
          : kind === 'group'
            ? ({ kind: 'group', conversationId: cid, title, messageId: message.id } as const)
            : ctx?.channelParentPostId?.trim()
              ? ({
                  kind: 'channel_comment',
                  conversationId: cid,
                  title,
                  postId: ctx.channelParentPostId.trim(),
                  commentMessageId: message.id,
                } as const)
              : ({ kind: 'channel_post', conversationId: cid, title, postMessageId: message.id } as const)

      toast.push({ tone: 'info', message: 'Сохранение…', ms: 1600 })
      const res = await saveMessageToSelfConversation({ message, source })
      toast.push({
        tone: res.ok ? 'success' : 'error',
        message: res.ok ? 'Сохранено' : 'Не удалось сохранить',
        ms: 2400,
      })
    },
    [activeConversationId, threadHeadConversation, toast, user?.id],
  )

  const openBookmarks = useCallback(() => {
    const cid = activeConversationId.trim()
    if (cid && typeof window !== 'undefined') {
      window.localStorage.setItem(`vmix:bookmarks-seen:${cid}`, new Date().toISOString())
    }
    setBookmarksPeerNewCount(0)
    setBookmarksOpen(true)
  }, [activeConversationId])

  const dmComposerNode = useMemo(
    () => (
      <MessengerThreadComposer
        replyTo={replyTo}
        editingMessageId={editingMessageId}
        pendingMessengerPhotos={pendingMessengerPhotos}
        draft={draft}
        onDraftChange={setDraft}
        threadLoading={threadLoading}
        photoUploading={photoUploading}
        sending={sending}
        isMobileMessenger={isMobileMessenger}
        bumpScrollIfPinned={bumpScrollIfPinned}
        onOpenLightbox={(urls, index) => setMessengerImageLightbox({ urls, index })}
        onRemovePendingPhoto={removePendingMessengerPhoto}
        draftLinkPreview={draftLinkPreview}
        draftLinkPreviewLoading={draftLinkPreviewLoading}
        onDismissDraftLinkPreview={dismissDraftLinkPreview}
        composerTextareaRef={composerTextareaRef}
        composerEmojiWrapRef={composerEmojiWrapRef}
        photoInputRef={photoInputRef}
        onComposerPaste={onComposerPaste}
        adjustMobileComposerHeight={adjustMobileComposerHeight}
        onSend={() => void sendMessage()}
        insertEmojiInDraft={insertEmojiInDraft}
        onAddPendingPhotoFiles={addPendingMessengerPhotoFiles}
        composerEmojiOpen={composerEmojiOpen}
        setComposerEmojiOpen={setComposerEmojiOpen}
        onClearReply={() => setReplyTo(null)}
        onCancelEdit={() => {
          setEditingMessageId(null)
          resetDraft()
        }}
        voiceUploading={voiceUploading}
        onVoiceRecorded={onVoiceRecorded}
        conversationId={activeConversationId}
      />
    ),
    [
      replyTo,
      editingMessageId,
      pendingMessengerPhotos,
      draft,
      threadLoading,
      photoUploading,
      sending,
      isMobileMessenger,
      bumpScrollIfPinned,
      removePendingMessengerPhoto,
      draftLinkPreview,
      draftLinkPreviewLoading,
      dismissDraftLinkPreview,
      onComposerPaste,
      adjustMobileComposerHeight,
      insertEmojiInDraft,
      addPendingMessengerPhotoFiles,
      composerEmojiOpen,
      voiceUploading,
      onVoiceRecorded,
      activeConversationId,
      resetDraft,
    ],
  )

  // dmMessageActionMenuNode is defined later (after callbacks)

  const threadHeadGcClosed = useMemo(
    () => isMessengerClosedGroupOrChannel(threadHeadConversation ?? null),
    [threadHeadConversation],
  )

  const directOtherUserId = useMemo(() => {
    if (!resolvedThreadConversationId) return ''
    const row = sortedItems.find((i) => i.id === resolvedThreadConversationId) ?? activeConversation
    if (!row || row.kind !== 'direct') return ''
    return row.otherUserId?.trim() ?? ''
  }, [resolvedThreadConversationId, sortedItems, activeConversation])

  // lastActivityAt нужен только для текста «последняя активность», онлайн берём из presence mirror
  useEffect(() => {
    setDirectPeerLastActivityAt(null)
    setDirectPeerShowLastActivity(true)
    const oid = directOtherUserId.trim()
    if (!oid || !user?.id || oid === user.id) return
    let cancelled = false
    void fetchPublicUserProfile(oid).then((peek) => {
      if (cancelled) return
      if (!peek.data || peek.error) return
      setDirectPeerLastActivityAt(peek.data.lastActivityAt)
      setDirectPeerShowLastActivity(peek.data.lastActivityVisible !== false)
    })
    return () => {
      cancelled = true
    }
  }, [directOtherUserId, user?.id])

  // Онлайн-состояние собеседников в дереве — единый источник (user_presence_public).
  // Для шапки ЛС берём тот же флаг, чтобы поведение совпадало 1:1.
  const directPeerPresenceDisplay = directOtherUserId.trim()
    ? directPeersPresence[directOtherUserId] ?? 'offline'
    : 'offline'

  /** Шаринг: `?msg=` / `post=` → скролл к посту/комментарию; параметры убираем из адреса после применения. */
  useEffect(() => {
    const msg = searchParams.get('msg')?.trim() ?? ''
    if (!msg) return
    const post = searchParams.get('post')?.trim() ?? ''
    const cid = conversationId.trim()
    if (!cid || activeConversationId.trim() !== cid) return
    const kind = threadHeadConversation?.kind
    if (!kind) return

    setPendingJump({
      conversationId: cid,
      messageId: msg,
      parentMessageId: post || null,
      ...(kind === 'direct' ? {} : { conversationKind: kind }),
      sourceTitle: threadHeadConversation?.title,
      sourceAvatarUrl: null,
    })

    const p = new URLSearchParams(searchParams)
    p.delete('msg')
    p.delete('post')
    const qs = p.toString()
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true })
  }, [
    activeConversationId,
    conversationId,
    location.pathname,
    navigate,
    searchParams,
    threadHeadConversation?.kind,
    threadHeadConversation?.title,
  ])

  useMessengerActiveConversationPublic({
    userId: user?.id,
    activeConversationId,
    threadHeadConversation,
    setActiveConversationIsPublic,
    setActiveConversationIsPublicLoading,
  })

  const isMemberOfActiveConversation = useMemo(
    () => Boolean(activeConversationId.trim() && items.some((i) => i.id === activeConversationId)),
    [activeConversationId, items],
  )
  const activeIsPublic = Boolean(
    (threadHeadConversation?.kind === 'group' || threadHeadConversation?.kind === 'channel') &&
      ((activeConversationIsPublic ?? null) === true ||
        (activeConversationIsPublic == null &&
          (threadHeadConversation?.isPublic === true || invitePreview?.isPublic === true))),
  )
  const viewerOnly = Boolean(
    (threadHeadConversation?.kind === 'group' || threadHeadConversation?.kind === 'channel') &&
      activeIsPublic &&
      !isMemberOfActiveConversation,
  )
  const canRequestJoin = Boolean(
    threadHeadConversation &&
      (threadHeadConversation.kind === 'group' || threadHeadConversation.kind === 'channel') &&
      !isMemberOfActiveConversation,
  )
  const joinActionLabel = inviteJoinMode
    ? 'Вступить'
    : activeIsPublic
    ? 'Вступить'
    : pendingJoinRequest
    ? 'Запрос отправлен'
    : 'Запросить доступ'
  const joinActionDisabled = inviteJoinBusy || joinRequestInFlight || pendingJoinRequest === true

  const canManageConversationJoinRequests = Boolean(
    activeConversationRole && MESSENGER_JOIN_REQUEST_MANAGER_ROLES.has(activeConversationRole),
  )

  const conversationInfoConv =
    conversationInfoId?.trim()
      ? sortedItems.find((i) => i.id === conversationInfoId) ??
        (activeConversation?.id === conversationInfoId ? activeConversation : null)
      : null

  const activeAvatarUrl =
    threadHeadConversation?.kind === 'direct'
      ? threadHeadConversation.avatarUrl ??
        (threadHeadConversation.otherUserId ? null : profile?.avatar_url ?? null)
      : null

  const joinOpenConversation = useCallback(async () => {
    if (!threadHeadConversation || (threadHeadConversation.kind !== 'group' && threadHeadConversation.kind !== 'channel')) return
    if (inviteJoinBusy || joinRequestInFlight) return
    if (inviteToken.trim() && invitePreview?.id && invitePreview.id === activeConversationId) {
      await joinFromInvite()
      return
    }

    const cid = activeConversationId.trim()
    if (!cid) return

    if (viewerOnly) {
      setInviteJoinBusy(true)
      setInviteError(null)
      try {
        if (threadHeadConversation.kind === 'group') {
          const res = await joinPublicGroupChat(cid)
          if (res.error) {
            setInviteError(res.error)
            return
          }
        } else {
          const res = await joinPublicChannel(cid)
          if (res.error) {
            setInviteError(res.error)
            return
          }
        }
        const listRes = await listMessengerConversationsWithContactAliases()
        if (!listRes.error && listRes.data) setItems(listRes.data)
      } finally {
        setInviteJoinBusy(false)
      }
      return
    }

    setJoinRequestInFlight(true)
    setJoinRequestError(null)
    try {
      const res = await requestConversationJoin(cid)
      if (res.error) {
        setJoinRequestError(res.error)
        return
      }
      if (res.data?.already_member) {
        const listRes = await listMessengerConversationsWithContactAliases()
        if (!listRes.error && listRes.data) setItems(listRes.data)
        return
      }
      if (res.data?.required_plan) {
        setJoinRequestError(`Требуется подписка «${res.data.required_plan}».`)
        return
      }
      setPendingJoinRequest(true)
      if (threadHeadConversation && (threadHeadConversation.kind === 'group' || threadHeadConversation.kind === 'channel')) {
        const k = threadHeadConversation.kind
        setPendingJoinSidebarById((prev) => ({
          ...prev,
          [cid]: buildJoinRequestPendingSidebarStub({
            id: cid,
            kind: k,
            title: threadHeadConversation.title,
            isPublic: threadHeadConversation.isPublic ?? false,
            publicNick: threadHeadConversation.publicNick ?? null,
            avatarPath: threadHeadConversation.avatarPath ?? null,
            avatarThumbPath: threadHeadConversation.avatarThumbPath ?? null,
            memberCount: threadHeadConversation.memberCount ?? 0,
            postingMode: threadHeadConversation.kind === 'channel' ? threadHeadConversation.postingMode : undefined,
            commentsMode: threadHeadConversation.kind === 'channel' ? threadHeadConversation.commentsMode : undefined,
          }),
        }))
      }
      toast.push({ tone: 'success', message: 'Запрос на вступление отправлен. Ожидайте подтверждения.', ms: 3200 })
    } finally {
      setJoinRequestInFlight(false)
    }
  }, [
    activeConversationId,
    inviteJoinBusy,
    invitePreview?.id,
    inviteToken,
    joinFromInvite,
    setItems,
    threadHeadConversation,
    viewerOnly,
    requestConversationJoin,
    setJoinRequestError,
    setPendingJoinRequest,
    setJoinRequestInFlight,
    toast,
  ])

  const publicBrowseJoinCta = useMemo(
    () =>
      canRequestJoin && viewerOnly && pendingJoinRequest !== true
        ? {
            label: joinActionLabel,
            disabled: joinActionDisabled || Boolean(inviteLoading),
            onClick: () => {
              void joinOpenConversation()
            },
          }
        : null,
    [
      canRequestJoin,
      joinActionDisabled,
      joinActionLabel,
      joinOpenConversation,
      inviteLoading,
      pendingJoinRequest,
      viewerOnly,
    ],
  )

  const approveJoinRequest = useCallback(
    async (requestId: string) => {
      if (joinRequestInFlight) return
      setJoinRequestInFlight(true)
      try {
        const res = await approveConversationJoinRequest(requestId)
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 3200 })
          return
        }
        toast.push({ tone: 'success', message: 'Заявка принята.', ms: 2200 })
        const listRes = await listConversationJoinRequests(activeConversationId.trim())
        if (!listRes.error) setConversationJoinRequests(listRes.data ?? [])
      } finally {
        setJoinRequestInFlight(false)
      }
    },
    [activeConversationId, joinRequestInFlight, toast],
  )

  const denyJoinRequest = useCallback(
    async (requestId: string) => {
      if (joinRequestInFlight) return
      setJoinRequestInFlight(true)
      try {
        const res = await denyConversationJoinRequest(requestId)
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 3200 })
          return
        }
        toast.push({ tone: 'success', message: 'Заявка отклонена.', ms: 2200 })
        const listRes = await listConversationJoinRequests(activeConversationId.trim())
        if (!listRes.error) setConversationJoinRequests(listRes.data ?? [])
      } finally {
        setJoinRequestInFlight(false)
      }
    },
    [activeConversationId, joinRequestInFlight, toast],
  )

  const kickConversationMember = useCallback(
    async (targetUserId: string) => {
      const cid = activeConversationId.trim()
      if (!cid || !targetUserId.trim() || kickMemberBusyId) return
      if (!window.confirm('Удалить участника из чата?')) return
      setKickMemberBusyId(targetUserId.trim())
      try {
        const res = await removeConversationMemberByStaff(cid, targetUserId.trim())
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 3200 })
          return
        }
        toast.push({ tone: 'success', message: 'Участник удалён из чата.', ms: 2200 })
        const listRes = await listConversationMembersForManagement(cid)
        if (!listRes.error) setConversationMembers(listRes.data ?? [])
      } finally {
        setKickMemberBusyId(null)
      }
    },
    [activeConversationId, kickMemberBusyId, toast],
  )

  const togglePinChatListItem = useCallback(
    (id: string) => {
      const t = id.trim()
      if (!t) return
      setPinnedChatIds((prev) => {
        if (prev.includes(t)) return prev.filter((x) => x !== t)
        if (prev.length >= MESSENGER_MAX_PINNED_CHATS) {
          toast.push({ tone: 'error', message: 'Не больше трёх закреплённых чатов', ms: 2600 })
          return prev
        }
        return [...prev, t]
      })
    },
    [toast],
  )

  const markChatReadFromListMenu = useCallback(
    async (item: MessengerConversationSummary) => {
      const res = await markMessengerConversationRead(item)
      if (res.error) {
        toast.push({ tone: 'error', message: res.error, ms: 2800 })
        return
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, unreadCount: 0 } : i)))
      setActiveConversation((prev) => (prev && prev.id === item.id ? { ...prev, unreadCount: 0 } : prev))
      requestMessengerUnreadRefresh()
      toast.push({ tone: 'success', message: 'Отмечено прочитанным', ms: 2000 })
    },
    [toast],
  )

  const forwardDmPickItems = useMemo(
    () =>
      sortedItems
        .filter((it) => it.kind === 'direct')
        .map((it) => ({
          id: it.id,
          title: it.title,
          avatarUrl: it.avatarUrl ?? (!it.otherUserId ? profile?.avatar_url ?? null : null),
        })),
    [sortedItems, profile?.avatar_url],
  )
  const chatListSearchNorm = useMemo(() => normalizeMessengerListSearch(chatListSearch), [chatListSearch])
  const deleteFlowTargetListItem = useMemo((): MessengerConversationSummary | null => {
    const tid = (deleteFlowConversationId ?? '').trim()
    if (!tid) return null
    return mergedItems.find((i) => i.id === tid) ?? null
  }, [deleteFlowConversationId, mergedItems])

  const deleteFlowPurgeGcKind = useMemo((): 'group' | 'channel' | null => {
    if (deleteFlowTargetListItem?.kind === 'channel' || deleteFlowTargetListItem?.kind === 'group') {
      return deleteFlowTargetListItem.kind
    }
    if (threadHeadConversation?.kind === 'channel' || threadHeadConversation?.kind === 'group') {
      return threadHeadConversation.kind
    }
    return null
  }, [deleteFlowTargetListItem, threadHeadConversation])

  const filteredSortedItems = useMemo(() => {
    const filteredByKind =
      conversationKindFilter === 'all' ? sortedItems : sortedItems.filter((i) => i.kind === conversationKindFilter)
    if (!chatListSearchNorm) return filteredByKind
    return filteredByKind.filter((item) => itemMatchesMessengerListSearch(item, chatListSearchNorm))
  }, [sortedItems, chatListSearchNorm, conversationKindFilter])

  useMessengerGlobalTreeSearch({
    chatListSearch,
    chatListSearchNorm,
    setChatListGlobalUsers,
    setChatListGlobalOpen,
    setChatListGlobalLoading,
  })

  const { extraGlobalUsers, extraGlobalOpen } = useMemo(() => {
    const visibleDm = new Set(
      filteredSortedItems.filter((i) => i.kind === 'direct' && i.otherUserId).map((i) => i.otherUserId!),
    )
    const visibleIds = new Set(filteredSortedItems.map((i) => i.id))

    let users = chatListGlobalUsers.filter((h) => {
      const inList = sortedItems.some((i) => i.kind === 'direct' && i.otherUserId === h.id)
      if (!inList) return true
      return !visibleDm.has(h.id)
    })

    let open = chatListGlobalOpen.filter((h) => {
      const inList = sortedItems.some((i) => i.id === h.id)
      if (!inList) return true
      return !visibleIds.has(h.id)
    })

    if (conversationKindFilter === 'direct') {
      open = []
    } else if (conversationKindFilter === 'group') {
      users = []
      open = open.filter((o) => o.kind === 'group')
    } else if (conversationKindFilter === 'channel') {
      users = []
      open = open.filter((o) => o.kind === 'channel')
    }

    return { extraGlobalUsers: users, extraGlobalOpen: open }
  }, [
    chatListGlobalUsers,
    chatListGlobalOpen,
    filteredSortedItems,
    sortedItems,
    conversationKindFilter,
  ])

  const messengerListHasRows =
    filteredSortedItems.length > 0 || extraGlobalUsers.length > 0 || extraGlobalOpen.length > 0

  const onMessengerForwardSourceNavigate = useCallback(
    (nav: MessengerForwardNav) => {
      if (nav.kind === 'channel_post') {
        navigate(
          buildMessengerUrl(nav.conversationId, undefined, undefined, { messageId: nav.postMessageId }),
        )
        return
      }
      if (nav.kind === 'channel_comment') {
        navigate(
          buildMessengerUrl(nav.conversationId, undefined, undefined, {
            messageId: nav.commentMessageId,
            parentMessageId: nav.postId,
          }),
        )
        return
      }
      if (nav.kind === 'group_message') {
        navigate(buildMessengerUrl(nav.conversationId, undefined, undefined, { messageId: nav.messageId }))
        return
      }
      if (nav.kind === 'dm_message') {
        navigate(buildMessengerUrl(nav.conversationId, undefined, undefined, { messageId: nav.messageId }))
        return
      }
      if (nav.kind === 'dm_profile') {
        openUserPeek({
          userId: nav.authorUserId,
          displayName: null,
          avatarUrl: null,
        })
      }
    },
    [navigate, openUserPeek],
  )

  const onMentionSlugOpenProfile = useCallback(
    async (rawSlug: string) => {
      const slug = normalizeProfileSlug(rawSlug)
      if (!slug) return
      /** Не `search_registered_users`: там исключён текущий пользователь — клик по своему @slug в «Сохранённом» давал «не найден». */
      const { data, error: rpcErr } = await supabase.rpc('get_user_public_profile_by_slug', {
        p_profile_slug: slug,
      })
      if (rpcErr) {
        toast.push({ tone: 'error', message: rpcErr.message, ms: 2600 })
        return
      }
      const row = data as Record<string, unknown> | null
      if (!row || row.ok !== true) {
        const code = typeof row?.error === 'string' ? row.error : ''
        toast.push({
          tone: 'error',
          message:
            code === 'not_found' || code === 'slug_required'
              ? 'Пользователь не найден'
              : 'Не удалось открыть профиль',
          ms: 2600,
        })
        return
      }
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      if (!id) {
        toast.push({ tone: 'error', message: 'Не удалось открыть профиль', ms: 2600 })
        return
      }
      openUserPeek({
        userId: id,
        displayName:
          typeof row.display_name === 'string' && row.display_name.trim()
            ? String(row.display_name).trim()
            : null,
        avatarUrl:
          typeof row.avatar_url === 'string' && row.avatar_url.trim() ? row.avatar_url.trim() : null,
      })
    },
    [openUserPeek, toast],
  )

  /** Сумма непрочитанных во всех диалогах, кроме открытого треда — для бейджа «Назад к чатам». */
  const totalOtherUnread = useMemo(
    () =>
      mergedItems
        .filter((i) => i.id !== foregroundThreadConversationId && !i.joinRequestPending)
        .reduce((sum, i) => sum + i.unreadCount, 0),
    [mergedItems, foregroundThreadConversationId],
  )

  const timelineMessages = useMemo(
    () => messages.filter((m) => m.kind !== 'reaction'),
    [messages],
  )

  const dmLastSignificantMessageId = useMemo(() => {
    const last = timelineMessages[timelineMessages.length - 1]
    return last?.id ?? null
  }, [timelineMessages])

  const onDmMarkedRead = useCallback(() => {
    const cid = conversationId.trim()
    if (!cid) return
    setItems((prev) => prev.map((item) => (item.id === cid ? { ...item, unreadCount: 0 } : item)))
    setActiveConversation((prev) => (prev && prev.id === cid ? { ...prev, unreadCount: 0 } : prev))
    refreshDirectPeerDmReceiptContext()
  }, [conversationId, refreshDirectPeerDmReceiptContext])

  useMessengerThreadReadCoordinator({
    conversationId: conversationId.trim(),
    kind: openRouteThreadKind === 'direct' ? 'direct' : null,
    enabled: Boolean(
      user?.id &&
        conversationId.trim() &&
        openRouteThreadKind === 'direct' &&
        mergedItems.some((i) => i.id === conversationId.trim()) &&
        !threadLoading,
    ),
    threadLoading,
    scrollRef: messagesScrollRef,
    readTailRef: dmReadTailRef,
    lastSignificantMessageId: dmLastSignificantMessageId,
    onMarkedRead: onDmMarkedRead,
  })

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
      const opKey = `${convId}::${targetMessageId}::${emoji}`
      if (reactionOpInFlightRef.current.has(opKey)) return
      reactionOpInFlightRef.current.add(opKey)

      const snapshot = messagesRef.current
      const sortedBefore = [...snapshot].sort(sortDirectMessagesChrono)
      const tailIdBefore = sortedBefore[sortedBefore.length - 1]?.id ?? null

      try {
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
      } finally {
        reactionOpInFlightRef.current.delete(opKey)
      }
    },
    [activeConversationId, profile?.display_name, syncThreadListAfterReaction, threadLoading, user?.id],
  )

  const closeMessageActionMenu = useCallback(() => setMessageMenu(null), [])

  const openForwardFromDmMessage = useCallback(
    (m: DirectMessage) => {
      if (!threadHeadConversation || threadHeadConversation.kind !== 'direct') return
      const conv = threadHeadConversation
      setForwardDmComment('')
      setForwardDmShowSource(true)
      setForwardDmModal({
        sourceMessage: m,
        sourceLabel: conv.otherUserId ? conv.title?.trim() || 'Личный чат' : 'Сохранённое',
        sourceNav: buildMessengerForwardNav(conv, m),
        excludeConversationId: activeConversationId,
      })
      closeMessageActionMenu()
    },
    [activeConversationId, closeMessageActionMenu, threadHeadConversation],
  )

  const handleForwardFromChannelMessage = useCallback(
    (message: DirectMessage) => {
      if (!threadHeadConversation || threadHeadConversation.kind !== 'channel') return
      const title = threadHeadConversation.title?.trim() || 'Канал'
      setForwardDmComment('')
      setForwardDmShowSource(true)
      setForwardDmModal({
        sourceMessage: message,
        sourceLabel: title,
        sourceNav: buildMessengerForwardNav(threadHeadConversation, message),
        excludeConversationId: activeConversationId,
      })
    },
    [activeConversationId, threadHeadConversation],
  )

  const handleForwardFromGroupMessage = useCallback(
    (message: DirectMessage) => {
      if (!threadHeadConversation || threadHeadConversation.kind !== 'group') return
      const title = threadHeadConversation.title?.trim() || 'Группа'
      setForwardDmComment('')
      setForwardDmShowSource(true)
      setForwardDmModal({
        sourceMessage: message,
        sourceLabel: title,
        sourceNav: buildMessengerForwardNav(threadHeadConversation, message),
        excludeConversationId: activeConversationId,
      })
    },
    [activeConversationId, threadHeadConversation],
  )

  const finishForwardToDms = useCallback(
    async (targetConvIds: string[]) => {
      if (!forwardDmModal || forwardDmSending) return
      const tids = (Array.isArray(targetConvIds) ? targetConvIds : [])
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
      if (tids.length === 0) return
      const comment = forwardDmComment.trim()
      setForwardDmSending(true)
      try {
        const src = forwardDmModal.sourceMessage
        const nav = forwardDmModal.sourceNav ?? undefined
        const forwardInfo = {
          forward_info: {
            label: forwardDmModal.sourceLabel.trim() || 'Источник',
            hidden: !(forwardDmShowSource && forwardDmModal.sourceLabel.trim()),
            ...(nav ? { nav } : {}),
          },
        }

        const sendComment = async (tid: string) => {
          if (!comment) return { ok: true as const }
          const cRes = await appendDirectMessage(tid, comment, { kind: 'text' })
          if (cRes.error) return { ok: false as const, error: cRes.error }
          return { ok: true as const }
        }

        if (src.kind === 'image') {
          const one = src.meta?.image?.path?.trim()
          const multi = Array.isArray(src.meta?.images) ? src.meta!.images : null
          const attach = multi && multi.length > 0 ? multi : one ? [src.meta!.image!] : []
          if (attach.length === 0) {
            toast.push({ tone: 'error', message: 'Не удалось переслать: нет изображения', ms: 3200 })
            return
          }

          const blobs: Blob[] = []
          for (const a of attach) {
            const srcPath = a.path?.trim()
            if (!srcPath) continue
            const url = await resolveMediaUrlForStoragePath(srcPath, { expiresSec: 3600 })
            if (!url) {
              toast.push({ tone: 'error', message: 'Не удалось переслать: изображение недоступно', ms: 3200 })
              return
            }
            const resp = await fetch(url)
            if (!resp.ok) {
              toast.push({ tone: 'error', message: 'Не удалось переслать: ошибка загрузки изображения', ms: 3200 })
              return
            }
            blobs.push(await resp.blob())
          }
          if (blobs.length === 0) {
            toast.push({ tone: 'error', message: 'Не удалось переслать: нет изображения', ms: 3200 })
            return
          }

          let okCount = 0
          for (const tid of tids) {
            const c = await sendComment(tid)
            if (!c.ok) {
              toast.push({ tone: 'error', message: c.error, ms: 3200 })
              return
            }

            const uploaded: Array<{ path: string; thumbPath?: string }> = []
            for (const blob of blobs) {
              const file = new File([blob], 'forward.jpg', { type: blob.type || 'image/jpeg' })
              const up = await uploadMessengerImage(tid, file)
              if (up.error || !up.path) {
                toast.push({ tone: 'error', message: up.error || 'Не удалось загрузить изображение', ms: 3200 })
                return
              }
              uploaded.push({ path: up.path, ...(up.thumbPath ? { thumbPath: up.thumbPath } : {}) })
            }

            const meta: Record<string, unknown> = {
              ...forwardInfo,
              ...(uploaded.length > 1 ? { images: uploaded } : { image: uploaded[0]! }),
            }
            const res = await appendDirectMessage(tid, src.body ?? '', { kind: 'image', meta })
            if (res.error) {
              toast.push({ tone: 'error', message: res.error, ms: 3200 })
              return
            }
            okCount++
          }
          requestMessengerUnreadRefresh()
          toast.push({
            tone: 'success',
            message: okCount === 1 ? 'Сообщение переслано.' : `Сообщение переслано (${okCount}).`,
            ms: 2400,
          })
        } else if (src.kind === 'audio') {
          const srcPath = src.meta?.audio?.path?.trim() ?? ''
          if (!srcPath) {
            toast.push({ tone: 'error', message: 'Не удалось переслать: нет аудио', ms: 3200 })
            return
          }
          const url = await resolveMediaUrlForStoragePath(srcPath, { expiresSec: 3600 })
          if (!url) {
            toast.push({ tone: 'error', message: 'Не удалось переслать: аудио недоступно', ms: 3200 })
            return
          }
          const resp = await fetch(url)
          if (!resp.ok) {
            toast.push({ tone: 'error', message: 'Не удалось переслать: ошибка загрузки аудио', ms: 3200 })
            return
          }
          const blob = await resp.blob()
          const durationSec = src.meta?.audio?.durationSec

          let okCount = 0
          for (const tid of tids) {
            const c = await sendComment(tid)
            if (!c.ok) {
              toast.push({ tone: 'error', message: c.error, ms: 3200 })
              return
            }
            const up = await uploadMessengerAudio(tid, blob)
            if (up.error || !up.path) {
              toast.push({ tone: 'error', message: up.error || 'Не удалось загрузить аудио', ms: 3200 })
              return
            }
            const meta: Record<string, unknown> = {
              ...forwardInfo,
              audio: {
                path: up.path,
                ...(typeof durationSec === 'number' && Number.isFinite(durationSec) ? { durationSec } : {}),
              },
            }
            const res = await appendDirectMessage(tid, src.body ?? '', { kind: 'audio', meta })
            if (res.error) {
              toast.push({ tone: 'error', message: res.error, ms: 3200 })
              return
            }
            okCount++
          }
          requestMessengerUnreadRefresh()
          toast.push({
            tone: 'success',
            message: okCount === 1 ? 'Сообщение переслано.' : `Сообщение переслано (${okCount}).`,
            ms: 2400,
          })
        } else {
          let okCount = 0
          for (const tid of tids) {
            const c = await sendComment(tid)
            if (!c.ok) {
              toast.push({ tone: 'error', message: c.error, ms: 3200 })
              return
            }
            const meta: Record<string, unknown> = { ...forwardInfo }
            const base = (src.body ?? '').trim() || '…'
            const res = await appendDirectMessage(tid, base, { kind: 'text', meta })
            if (res.error) {
              toast.push({ tone: 'error', message: res.error, ms: 3200 })
              return
            }
            okCount++
          }
          requestMessengerUnreadRefresh()
          toast.push({
            tone: 'success',
            message: okCount === 1 ? 'Сообщение переслано.' : `Сообщение переслано (${okCount}).`,
            ms: 2400,
          })
        }
        setForwardDmModal(null)
        setForwardDmComment('')
        setForwardDmShowSource(true)
      } finally {
        setForwardDmSending(false)
      }
    },
    [
      appendDirectMessage,
      forwardDmComment,
      forwardDmModal,
      forwardDmSending,
      forwardDmShowSource,
      toast,
      uploadMessengerAudio,
      uploadMessengerImage,
    ],
  )

  const deleteMessageFromMenu = useCallback(async () => {
    const convId = activeConversationId.trim()
    const m = messageMenu?.message
    if (!user?.id || !convId || !m?.id || m.id.startsWith('local-')) return
    if (m.senderUserId !== user.id) return
    if (m.kind !== 'text' && m.kind !== 'image' && m.kind !== 'audio') return
    if (threadLoading) return

    closeMessageActionMenu()
    const res = await deleteDirectMessage(convId, m.id)
    if (res.error) setError(res.error)
  }, [activeConversationId, closeMessageActionMenu, deleteDirectMessage, messageMenu?.message, threadLoading, user?.id])

  const toggleFavoriteFromMessageMenu = useCallback(async () => {
    const m = messageMenu?.message
    const sid = m?.senderUserId?.trim()
    if (!sid || !user?.id || sid === user.id) return
    setPinBusyUserId(sid)
    try {
      const cur = senderContactByUserId[sid]?.pinnedByMe ?? false
      const res = await setContactPin(sid, !cur)
      if (res.data) {
        setSenderContactByUserId((prev) => ({ ...prev, [sid]: res.data! }))
      }
    } finally {
      setPinBusyUserId(null)
    }
    closeMessageActionMenu()
  }, [closeMessageActionMenu, messageMenu, senderContactByUserId, setSenderContactByUserId, user?.id])

  useEscapeKey(Boolean(messageMenu), closeMessageActionMenu)
  useMessengerMessageMenuPopoverLayout(messageMenu, msgMenuWrapRef)

  const refocusMessengerComposer = useCallback(() => {
    if (!isMobileMessenger) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const ta = composerTextareaRef.current
        if (!ta || ta.disabled) return
        ta.focus()
        const len = ta.value.length
        try {
          ta.setSelectionRange(len, len)
        } catch {
          /* некоторые мобильные WebView */
        }
      })
    })
  }, [isMobileMessenger])

  const closeMessengerImageLightbox = useCallback(() => {
    setMessengerImageLightbox(null)
    refocusMessengerComposer()
  }, [refocusMessengerComposer])

  const beginDeleteChatFromListItem = useCallback(
    async (item: MessengerConversationSummary) => {
      if (!user?.id || deleteChatBusy) return
      if (item.joinRequestPending) {
        toast.push({ tone: 'warning', message: 'Сначала дождитесь вступления в чат.', ms: 3200 })
        return
      }
      setChatListRowMenu(null)
      const cid = item.id.trim()
      if (!cid) return
      setDeleteFlowConversationId(cid)

      if (item.kind === 'direct') {
        setMessengerDeleteUi({ step: 'dm-pick' })
        return
      }
      if (item.kind !== 'group' && item.kind !== 'channel') {
        setDeleteFlowConversationId(null)
        return
      }

      const { data, error } = await supabase
        .from('chat_conversation_members')
        .select('role')
        .eq('conversation_id', cid)
        .eq('user_id', user.id)
        .maybeSingle()

      if (error || !data) {
        toast.push({ tone: 'error', message: 'Не удалось проверить роль в чате.', ms: 3200 })
        setDeleteFlowConversationId(null)
        return
      }
      const role =
        typeof (data as { role?: unknown }).role === 'string'
          ? String((data as { role: string }).role).trim()
          : null
      if (!role) {
        toast.push({ tone: 'error', message: 'Вы не участник этого чата.', ms: 3200 })
        setDeleteFlowConversationId(null)
        return
      }
      if (role === 'owner') {
        setMessengerDeleteUi({ step: 'confirm', kind: 'purge-gc' })
      } else {
        setMessengerDeleteUi({
          step: 'confirm',
          kind: item.kind === 'group' ? 'leave-group' : 'leave-channel',
        })
      }
    },
    [user?.id, deleteChatBusy, toast],
  )

  const executeDeleteChatAction = useCallback(
    async (kind: 'dm-me' | 'dm-all' | 'leave-group' | 'leave-channel' | 'purge-gc') => {
      const cid = (deleteFlowConversationId ?? activeConversationId).trim()
      if (!cid) return
      setDeleteChatBusy(true)
      try {
        let err: string | null = null
        if (kind === 'dm-me') err = (await leaveDirectConversationClient(cid)).error
        else if (kind === 'dm-all') err = (await deleteDirectConversationForAllClient(cid)).error
        else if (kind === 'leave-group') err = (await leaveGroupOrChannelClient('group', cid)).error
        else if (kind === 'leave-channel') err = (await leaveGroupOrChannelClient('channel', cid)).error
        else if (kind === 'purge-gc') err = (await deleteOwnedGroupOrChannelClient(cid)).error

        if (err) {
          toast.push({ tone: 'error', message: err, ms: 3800 })
          return
        }
        const listRes = await listMessengerConversationsWithContactAliases()
        if (!listRes.error && listRes.data) setItems(listRes.data)
        setMessages([])
        setActiveConversation(null)
        setMessengerDeleteUi(null)
        setDeleteFlowConversationId(null)
        requestMessengerUnreadRefresh()
        navigate(isMobileMessenger ? '/dashboard/messenger?view=list' : '/dashboard/messenger', { replace: true })
        toast.push({ tone: 'success', message: 'Чат удалён', ms: 2400 })
      } finally {
        setDeleteChatBusy(false)
      }
    },
    [deleteFlowConversationId, activeConversationId, isMobileMessenger, navigate, toast],
  )

  const bindMessageAnchor = useCallback((messageId: string, el: HTMLElement | null) => {
    if (el) messageAnchorRef.current.set(messageId, el)
    else messageAnchorRef.current.delete(messageId)
  }, [])

  const scrollToQuotedMessage = useCallback((quotedId: string) => {
    const el = messageAnchorRef.current.get(quotedId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('dashboard-messenger__message--highlight')
    window.setTimeout(() => {
      el.classList.remove('dashboard-messenger__message--highlight')
    }, 1400)
  }, [])

  useMessengerPendingJumpToQuoted({
    pendingJump,
    setPendingJump,
    activeConversationId,
    threadHeadKind: threadHeadConversation?.kind,
    messages,
    threadLoading,
    loadingOlder,
    hasMoreOlder,
    loadOlderMessages,
    scrollToQuotedMessage,
  })

  const goCreateRoomFromMessenger = useCallback(() => {
    const id = newRoomId()
    setPendingHostClaim(id)
    stashSpaceRoomCreateOptions(id, { lifecycle: 'permanent', chatVisibility: 'everyone' })
    if (threadHeadConversation?.kind !== 'direct') {
      navigate(`/r/${encodeURIComponent(id)}`)
      return
    }
    const otherId = threadHeadConversation.otherUserId?.trim()
    const activeId = activeConversationId.trim()
    if (otherId && user?.id && otherId !== user.id) {
      const peerTitle = threadHeadConversation?.title?.trim() || null
      const body = `Приглашаю в комнату: [${id}]`
      const sameOpenDm =
        Boolean(activeId) &&
        threadHeadConversation?.id === activeId &&
        threadHeadConversation?.otherUserId?.trim() === otherId
      void (async () => {
        if (sameOpenDm) {
          await appendDirectMessage(activeId, body)
          return
        }
        const ensured = await ensureDirectConversationWithUser(otherId, peerTitle)
        if (!ensured.error && ensured.data) {
          await appendDirectMessage(ensured.data, body)
        }
      })()
    }
    navigate(`/r/${encodeURIComponent(id)}`)
  }, [navigate, threadHeadConversation, user?.id, activeConversationId])

  const openCreateConversationModal = useCallback(() => {
    setCreateError(null)
    setCreateBusy(false)
    setCreateKind('group')
    setCreateIsOpen(true)
    setCreateTitle('')
    setCreateNick('')
    setCreateLogoFile(null)
    setCreateChannelComments('comments')
    setCreateModalOpen(true)
  }, [])

  const closeCreateConversationModal = useCallback(() => {
    if (createBusy) return
    setCreateModalOpen(false)
    setCreateError(null)
  }, [createBusy])

  const submitCreateConversation = useCallback(async () => {
    if (!user?.id || createBusy) return
    const title = createTitle.trim()
    const nickRaw = createNick.trim().toLowerCase()
    const nick = nickRaw ? nickRaw.replace(/\s+/g, '_') : ''
    const nickOk = !nick || /^[a-z0-9_]{3,32}$/.test(nick)
    if (!title) {
      setCreateError('Введите название.')
      return
    }
    if (!nickOk) {
      setCreateError('Ник: только a-z, 0-9, _ (3–32 символа).')
      return
    }

    setCreateBusy(true)
    setCreateError(null)
    try {
      const isPublic = createIsOpen
      let conversationId: string | null = null

      if (createKind === 'group') {
        const res = await createGroupChat(title, isPublic)
        if (res.error || !res.data) {
          setCreateError(res.error ?? 'Не удалось создать группу.')
          return
        }
        conversationId = res.data
      } else {
        const commentsMode = createChannelComments === 'comments' ? 'everyone' : 'disabled'
        const res = await createChannel(title, { isPublic, postingMode: 'admins_only', commentsMode })
        if (res.error || !res.data) {
          setCreateError(res.error ?? 'Не удалось создать канал.')
          return
        }
        conversationId = res.data
      }

      if (!conversationId) {
        setCreateError('Не удалось создать.')
        return
      }

      let avatarPath: string | null = null
      let avatarThumbPath: string | null = null
      if (createLogoFile) {
        const up = await uploadMessengerImage(conversationId, createLogoFile)
        if (up.error) {
          setCreateError(up.error)
          return
        }
        avatarPath = up.path
        avatarThumbPath = up.thumbPath
      }

      if (createKind === 'group') {
        const upd = await updateGroupProfile({
          conversationId,
          publicNick: nick || null,
          isPublic,
          ...(avatarPath ? { avatarPath } : {}),
          ...(avatarThumbPath ? { avatarThumbPath } : {}),
        })
        if (upd.error) {
          setCreateError(upd.error === 'nick_taken' ? 'Ник уже занят.' : upd.error)
          return
        }
      } else {
        const commentsMode = createChannelComments === 'comments' ? 'everyone' : 'disabled'
        const upd = await updateChannelProfile({
          conversationId,
          publicNick: nick || null,
          isPublic,
          postingMode: 'admins_only',
          commentsMode,
          ...(avatarPath ? { avatarPath } : {}),
          ...(avatarThumbPath ? { avatarThumbPath } : {}),
        })
        if (upd.error) {
          setCreateError(upd.error === 'nick_taken' ? 'Ник уже занят.' : upd.error)
          return
        }
      }

      setCreateModalOpen(false)
      setCreateLogoFile(null)

      const listRes = await listMessengerConversationsWithContactAliases()
      if (!listRes.error && listRes.data) setItems(listRes.data)

      navigate(`/dashboard/messenger/${encodeURIComponent(conversationId)}`)
    } finally {
      setCreateBusy(false)
    }
  }, [
    user?.id,
    createBusy,
    createTitle,
    createNick,
    createLogoFile,
    createKind,
    createIsOpen,
    createChannelComments,
    navigate,
    setItems,
  ])

  const dmMessageActionMenuNode = useMemo(
    () =>
      messageMenu ? (
        <MessengerDmMessageMenuPortal open={true} msgMenuWrapRef={msgMenuWrapRef}>
          <MessengerMessageMenuPopover
            canEdit={Boolean(
              user?.id &&
                messageMenu.message.senderUserId === user.id &&
                !messageMenu.message.id.startsWith('local-') &&
                (messageMenu.message.kind === 'text' ||
                  messageMenu.message.kind === 'image' ||
                  messageMenu.message.kind === 'audio'),
            )}
            canCopy={Boolean(
              !messageMenu.message.id.startsWith('local-') &&
                (messageMenu.message.kind === 'text' ||
                  messageMenu.message.kind === 'image' ||
                  messageMenu.message.kind === 'audio') &&
                !isDmSoftDeletedStub(messageMenu.message),
            )}
            canBookmark={Boolean(
              user?.id &&
                !messageMenu.message.id.startsWith('local-') &&
                (messageMenu.message.kind === 'text' ||
                  messageMenu.message.kind === 'image' ||
                  messageMenu.message.kind === 'audio' ||
                  messageMenu.message.kind === 'system') &&
                !isDmSoftDeletedStub(messageMenu.message),
            )}
            canSave={Boolean(
              user?.id &&
                !messageMenu.message.id.startsWith('local-') &&
                (messageMenu.message.kind === 'text' ||
                  messageMenu.message.kind === 'image' ||
                  messageMenu.message.kind === 'audio' ||
                  messageMenu.message.kind === 'system') &&
                !isDmSoftDeletedStub(messageMenu.message),
            )}
            canDelete={Boolean(
              user?.id &&
                messageMenu.message.senderUserId === user.id &&
                !messageMenu.message.id.startsWith('local-') &&
                (messageMenu.message.kind === 'text' ||
                  messageMenu.message.kind === 'image' ||
                  messageMenu.message.kind === 'audio'),
            )}
            dmOutgoingReceipt={
              threadHeadConversation?.kind === 'direct' &&
              !(
                threadHeadConversation.title.trim().toLowerCase() === 'сохраненное' &&
                !threadHeadConversation.otherUserId?.trim()
              )
                ? (() => {
                    const uid = user?.id ?? ''
                    const level = directOutgoingReceiptStatus(messageMenu.message, {
                      isOwn: Boolean(uid && messageMenu.message.senderUserId === uid),
                      isDirectThread: true,
                      peerLastReadAt: directPeerLastReadAt,
                      viewerReceiptsPrivate: profile?.profile_dm_receipts_private === true,
                      peerReceiptsPrivate: directPeerReceiptsPrivate,
                    })
                    return level ? { level, messageId: messageMenu.message.id } : null
                  })()
                : null
            }
            timestampLabel={formatDateTime(messageMenu.message.createdAt)}
            onClose={closeMessageActionMenu}
            onCopy={async () => {
              const text = previewTextForDirectMessageTail(messageMenu.message)
              const ok = await copyTextToClipboard(text)
              toast.push({
                tone: ok ? 'success' : 'error',
                message: ok ? 'Скопировано в буфер обмена' : 'Не удалось скопировать',
                ms: 2200,
              })
            }}
            onBookmark={() => {
              setDmBookmarkScopePick({ messageId: messageMenu.message.id })
            }}
            onSave={async () => saveMessageFromActiveConversation(messageMenu.message)}
            onEdit={() => {
              const m = messageMenu.message
              setEditingMessageId(m.id)
              setReplyTo(null)
              setComposerEmojiOpen(false)
              setDraft(m.body)
              closeMessageActionMenu()
              queueMicrotask(() => composerTextareaRef.current?.focus())
            }}
            onDelete={() => {
              void deleteMessageFromMenu()
            }}
            onReply={() => {
              setReplyTo(messageMenu.message)
              closeMessageActionMenu()
            }}
            onForward={
              threadHeadConversation?.kind === 'direct' &&
              !messageMenu.message.id.startsWith('local-') &&
              (messageMenu.message.kind === 'text' ||
                messageMenu.message.kind === 'image' ||
                messageMenu.message.kind === 'audio')
                ? () => openForwardFromDmMessage(messageMenu.message)
                : undefined
            }
            onPickReaction={(emoji) => {
              if (!isDirectReactionEmoji(emoji)) return
              void toggleMessengerReaction(messageMenu.message.id, emoji)
              closeMessageActionMenu()
            }}
            showAddPin={Boolean(
              messageMenu.message.senderUserId &&
                user?.id &&
                messageMenu.message.senderUserId !== user.id,
            )}
            pinActive={Boolean(
              messageMenu.message.senderUserId &&
                senderContactByUserId[messageMenu.message.senderUserId]?.pinnedByMe,
            )}
            pinBusy={
              Boolean(messageMenu.message.senderUserId) &&
              pinBusyUserId === messageMenu.message.senderUserId
            }
            onTogglePin={() => {
              void toggleFavoriteFromMessageMenu()
            }}
          />
        </MessengerDmMessageMenuPortal>
      ) : null,
    [
      messageMenu,
      msgMenuWrapRef,
      user?.id,
      threadHeadConversation,
      directPeerLastReadAt,
      profile?.profile_dm_receipts_private,
      directPeerReceiptsPrivate,
      closeMessageActionMenu,
      toast,
      saveMessageFromActiveConversation,
      deleteMessageFromMenu,
      openForwardFromDmMessage,
      toggleMessengerReaction,
      senderContactByUserId,
      pinBusyUserId,
      toggleFavoriteFromMessageMenu,
      composerTextareaRef,
    ],
  )

  const openConversationInfo = useCallback(
    async (cid: string) => {
      const id = cid.trim()
      if (!id) return
      const conv = itemsRef.current.find((i) => i.id === id) ?? (activeConversation?.id === id ? activeConversation : null)
      if (!conv || (conv.kind !== 'group' && conv.kind !== 'channel')) return

      setConversationInfoOpen(true)
      setConversationInfoId(id)
      setConversationInfoEdit(false)
      setConversationInfoError(null)
      setConversationInfoLogoFile(null)
      setConversationInfoNotificationsBusy(false)
      setConversationInfoNotificationsMuted(mutedConversationIdsRef.current.has(id))
      setConversationInfoTitle(conv.title)
      setConversationInfoNick((conv.publicNick ?? '').trim())
      setConversationInfoIsOpen(conv.isPublic !== false)
      setConversationInfoChannelComments(
        conv.kind === 'channel' && conv.commentsMode === 'disabled' ? 'reactions_only' : 'comments',
      )

      if (!user?.id) return
      setConversationInfoLoading(true)
      setConversationInfoRole(null)
      try {
        const { data, error } = await supabase
          .from('chat_conversation_members')
          .select('role')
          .eq('conversation_id', id)
          .eq('user_id', user.id)
          .maybeSingle()
        if (error) {
          setConversationInfoRole(null)
        } else {
          const role = typeof (data as any)?.role === 'string' ? String((data as any).role) : null
          setConversationInfoRole(role)
        }
      } finally {
        setConversationInfoLoading(false)
      }

      const muteRes = await getMyConversationNotificationMutes([id])
      if (!muteRes.error && muteRes.data) {
        const nextMuted = muteRes.data[id] === true
        setConversationInfoNotificationsMuted(nextMuted)
        setMutedConversationIds((prev) => {
          const next = new Set(prev)
          if (nextMuted) next.add(id)
          else next.delete(id)
          return next
        })
      }
    },
    [activeConversation, user?.id],
  )

  const closeConversationInfo = useCallback(() => {
    setConversationInfoOpen(false)
    setConversationInfoId(null)
    setConversationInfoEdit(false)
    setConversationInfoError(null)
    setConversationInfoLogoFile(null)
    setConversationInfoNotificationsBusy(false)
    setLeaveConfirmOpen(false)
    setLeaveBusy(false)
    setLeaveError(null)
    setConversationStaffRows([])
    setConversationStaffTargetUserId('')
    setConversationStaffNewRole('moderator')
    setConversationStaffLoading(false)
    setConversationStaffMutating(false)
  }, [])

  const confirmLeaveConversation = useCallback(async () => {
    if (!conversationInfoConv || conversationInfoConv.kind === 'direct') return
    if (!conversationInfoRole || leaveBusy) return
    setLeaveBusy(true)
    setLeaveError(null)
    try {
      const cid = conversationInfoConv.id.trim()
      if (!cid) return
      const res =
        conversationInfoConv.kind === 'group' ? await leaveGroupChat(cid) : await leaveChannel(cid)
      if (res.error) {
        setLeaveError(res.error)
        return
      }
      const listRes = await listMessengerConversationsWithContactAliases()
      if (!listRes.error && listRes.data) setItems(listRes.data)
      setLeaveConfirmOpen(false)
      closeConversationInfo()
      navigate('/dashboard/messenger?view=list', { replace: true })
    } finally {
      setLeaveBusy(false)
    }
  }, [closeConversationInfo, conversationInfoConv, conversationInfoRole, leaveBusy, navigate, setItems])

  const toggleConversationNotificationsMuted = useCallback(
    async (nextMuted: boolean) => {
      const cid = conversationInfoId?.trim() ?? ''
      if (!cid || !user?.id || conversationInfoNotificationsBusy) return
      setConversationInfoNotificationsBusy(true)
      try {
        const res = await setConversationNotificationsMuted(cid, nextMuted)
        if (!res.ok) {
          setConversationInfoError(res.error ?? 'Не удалось изменить уведомления.')
          return
        }
        setConversationInfoNotificationsMuted(nextMuted)
        setMutedConversationIds((prev) => {
          const next = new Set(prev)
          if (nextMuted) next.add(cid)
          else next.delete(cid)
          return next
        })
      } finally {
        setConversationInfoNotificationsBusy(false)
      }
    },
    [conversationInfoId, user?.id, conversationInfoNotificationsBusy],
  )

  const cancelConversationInfoEdit = useCallback(() => {
    const id = conversationInfoId?.trim()
    if (!id) return
    const conv = sortedItems.find((i) => i.id === id) ?? (activeConversation?.id === id ? activeConversation : null)
    if (!conv || conv.kind === 'direct') return
    setConversationInfoEdit(false)
    setConversationInfoError(null)
    setConversationInfoLogoFile(null)
    setConversationInfoTitle(conv.title)
    setConversationInfoNick((conv.publicNick ?? '').trim())
    setConversationInfoIsOpen(conv.isPublic !== false)
    if (conv.kind === 'channel') {
      setConversationInfoChannelComments(conv.commentsMode === 'disabled' ? 'reactions_only' : 'comments')
    }
    setConversationStaffRows([])
    setConversationStaffTargetUserId('')
    setConversationStaffNewRole('moderator')
    setConversationStaffLoading(false)
    setConversationStaffMutating(false)
  }, [activeConversation, conversationInfoId, sortedItems])

  useConversationInfoStaffLoad({
    conversationInfoEdit,
    conversationInfoId,
    conversationInfoConv,
    conversationInfoRole,
    userId: user?.id,
    setConversationStaffRows,
    setConversationStaffTargetUserId,
    setConversationStaffNewRole,
    setConversationStaffLoading,
  })

  const applyConversationStaffRole = useCallback(async () => {
    const cid = conversationInfoId?.trim() ?? ''
    const tid = conversationStaffTargetUserId.trim()
    if (!user?.id || !cid || !tid || conversationStaffMutating) return
    setConversationStaffMutating(true)
    try {
      const res = await setConversationMemberStaffRole(cid, tid, conversationStaffNewRole)
      if (res.error) {
        toast.push({ tone: 'error', message: res.error, ms: 3200 })
        return
      }
      toast.push({ tone: 'success', message: 'Роль обновлена.', ms: 2200 })
      const list = await listConversationStaffMembers(cid)
      if (!list.error) setConversationStaffRows(list.data ?? [])
      setConversationStaffTargetUserId('')
    } finally {
      setConversationStaffMutating(false)
    }
  }, [
    conversationInfoId,
    conversationStaffMutating,
    conversationStaffNewRole,
    conversationStaffTargetUserId,
    toast,
    user?.id,
  ])

  const shareConversationInvite = useCallback(async () => {
    const cid = conversationInfoId?.trim() ?? ''
    if (!cid) return
    const res = await getOrCreateConversationInvite(cid)
    if (res.error || !res.data?.token) {
      toast.push({ tone: 'error', message: res.error ?? 'Не удалось создать ссылку.', ms: 2600 })
      return
    }
    const url = `${window.location.origin}/dashboard/messenger?invite=${encodeURIComponent(res.data.token)}`
    // iOS Safari часто блокирует clipboard после async-await (теряется "user gesture").
    // Поэтому сначала пытаемся открыть нативное меню «Поделиться», а уже потом — копирование.
    try {
      if (typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function') {
        await (navigator as any).share({ url })
        return
      }
    } catch {
      // ignore (например, user cancelled)
    }
    const ok = await copyTextToClipboard(url)
    if (ok) toast.push({ tone: 'success', message: 'Ссылка скопирована.', ms: 2200 })
    else {
      try {
        window.prompt('Скопируйте ссылку:', url)
      } catch {
        // ignore
      }
      toast.push({ tone: 'info', message: url, ms: 4200 })
    }
  }, [conversationInfoId, toast])

  const saveConversationInfo = useCallback(async () => {
    const cid = conversationInfoId?.trim() ?? ''
    if (!user?.id || !cid || conversationInfoLoading) return
    const title = conversationInfoTitle.trim()
    const nickRaw = conversationInfoNick.trim().toLowerCase()
    const nick = nickRaw ? nickRaw.replace(/\s+/g, '_') : ''
    const nickOk = !nick || /^[a-z0-9_]{3,32}$/.test(nick)
    if (!title) {
      setConversationInfoError('Введите название.')
      return
    }
    if (!nickOk) {
      setConversationInfoError('Ник: только a-z, 0-9, _ (3–32).')
      return
    }

    setConversationInfoLoading(true)
    setConversationInfoError(null)
    try {
      const conv = itemsRef.current.find((i) => i.id === cid) ?? activeConversation
      const kind = conv?.kind ?? 'group'

      let avatarPath: string | null = null
      let avatarThumbPath: string | null = null
      if (conversationInfoLogoFile) {
        const up = await uploadMessengerImage(cid, conversationInfoLogoFile)
        if (up.error) {
          setConversationInfoError(up.error)
          return
        }
        avatarPath = up.path
        avatarThumbPath = up.thumbPath
      }

      if (kind === 'group') {
        const upd = await updateGroupProfile({
          conversationId: cid,
          title,
          publicNick: nick || null,
          isPublic: conversationInfoIsOpen,
          ...(avatarPath ? { avatarPath } : {}),
          ...(avatarThumbPath ? { avatarThumbPath } : {}),
        })
        if (upd.error) {
          setConversationInfoError(upd.error === 'nick_taken' ? 'Ник уже занят.' : upd.error)
          return
        }
      } else if (kind === 'channel') {
        const commentsMode = conversationInfoChannelComments === 'comments' ? 'everyone' : 'disabled'
        const upd = await updateChannelProfile({
          conversationId: cid,
          title,
          publicNick: nick || null,
          isPublic: conversationInfoIsOpen,
          postingMode: 'admins_only',
          commentsMode,
          ...(avatarPath ? { avatarPath } : {}),
          ...(avatarThumbPath ? { avatarThumbPath } : {}),
        })
        if (upd.error) {
          setConversationInfoError(upd.error === 'nick_taken' ? 'Ник уже занят.' : upd.error)
          return
        }
      }

      const listRes = await listMessengerConversationsWithContactAliases()
      if (!listRes.error && listRes.data) setItems(listRes.data)
      setConversationInfoEdit(false)
      setConversationInfoLogoFile(null)
      toast.push({ tone: 'success', message: 'Сохранено.', ms: 1800 })
    } finally {
      setConversationInfoLoading(false)
    }
  }, [
    activeConversation,
    conversationInfoChannelComments,
    conversationInfoId,
    conversationInfoIsOpen,
    conversationInfoLoading,
    conversationInfoLogoFile,
    conversationInfoNick,
    conversationInfoTitle,
    setItems,
    toast,
    user?.id,
  ])

  return (
    <DashboardShell
      active="messenger"
      canAccessAdmin={canAccessAdmin}
      onSignOut={() => signOut()}
      chromeless={isMobileMessenger}
      suppressBurger={!isMobileMessenger}
      headerExtra={
        !isMobileMessenger ? (
          <div className="dashboard-topbar__messenger-controls">
            <button
              type="button"
              className="dashboard-messenger__list-head-btn"
              onClick={() => setMessengerSettingsOpen(true)}
              aria-label="Настройки мессенджера"
              title="Настройки мессенджера"
            >
              <FiRrIcon name="settings" />
            </button>
          </div>
        ) : null
      }
    >
      <section
        className={`dashboard-section dashboard-messenger dashboard-messenger--fill dashboard-messenger--font-${messengerFontPreset}${
          isMobileMessenger ? ' dashboard-messenger--mobile-chromeless' : ''
        }`}
      >
        <>
          <MessengerNetStrip state={netBanner} />
          <div className="dashboard-messenger__layout">
            {showListPane ? (
              <MessengerChatListAside
                isMobileMessenger={isMobileMessenger}
                chatListSearch={chatListSearch}
                onChatListSearchChange={setChatListSearch}
                openCreateConversationModal={openCreateConversationModal}
                goCreateRoomFromMessenger={goCreateRoomFromMessenger}
                onOpenMessengerSettings={() => setMessengerSettingsOpen(true)}
                conversationKindFilter={conversationKindFilter}
                onConversationKindFilterChange={setConversationKindFilter}
                filterUnreadByKind={filterUnreadByKind}
                onRefreshChatList={isMobileMessenger ? refreshChatList : undefined}
                chatListRefreshing={chatListRefreshing}
                loading={loading}
                sortedItems={sortedItems}
                messengerListHasRows={messengerListHasRows}
                chatListGlobalLoading={chatListGlobalLoading}
                filteredSortedItems={filteredSortedItems}
                extraGlobalUsers={extraGlobalUsers}
                extraGlobalOpen={extraGlobalOpen}
                profileAvatarUrl={profile?.avatar_url}
                userId={user?.id}
                conversationAvatarUrlById={conversationAvatarUrlById}
                activeConversationId={sidebarActiveConversationId}
                mentionUnreadByConversationId={mentionUnreadByConversationId}
                selectConversation={selectConversation}
                navigate={navigate}
                directPeersPresence={directPeersPresence}
                pinnedChatIds={pinnedChatIds}
                setChatListRowMenu={setChatListRowMenu}
              />
            ) : null}

            {showThreadPane ? (
              <div
                className={`dashboard-messenger__thread${isMobileMessenger ? ' dashboard-messenger__thread--mobile' : ''}`}
              >
                {(loading ||
                  (Boolean(inviteToken.trim()) &&
                    inviteLoading &&
                    !invitePreview?.id &&
                    !inviteError)) &&
                !threadHeadConversation ? (
                  <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…">
                    <BrandLogoLoader size={56} />
                  </div>
                ) : threadHeadConversation ? (
                  threadHeadConversation.kind === 'group' || threadHeadConversation.kind === 'channel' ? (
                    inviteJoinMode ? (
                      <div className="dashboard-messenger__thread-body dashboard-messenger__thread-body--join-gate">
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
                              </div>
                              <div className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--thread-block">
                                <div className="dashboard-messenger__thread-head-center-meta">
                                  {threadHeadConversation.kind === 'channel' ? 'Канал' : 'Группа'}
                                </div>
                                <div className="dashboard-messenger__thread-head-center-title">
                                  {threadHeadConversation.title}
                                </div>
                              </div>
                              <div className="dashboard-messenger__list-head-actions" aria-hidden="true" />
                            </header>
                          ) : (
                            <div className="dashboard-messenger__thread-head-center" style={{ padding: 16 }}>
                              <div className="dashboard-messenger__thread-head-center-meta">
                                {threadHeadConversation.kind === 'channel' ? 'Канал' : 'Группа'} ·{' '}
                                {invitePreview?.memberCount ?? threadHeadConversation.memberCount ?? 0} участн.
                              </div>
                              <div className="dashboard-messenger__thread-head-center-title">{threadHeadConversation.title}</div>
                            </div>
                          )}
                        </div>

                        {inviteLoading ? (
                          <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" />
                        ) : (
                          <div className="messenger-join-gate">
                            <div className="messenger-join-gate__card">
                              <div className="dashboard-messenger__gc-avatar-lock-wrap dashboard-messenger__gc-avatar-lock-wrap--join">
                                <div className="messenger-join-gate__avatar" aria-hidden>
                                  {invitePreview && conversationAvatarUrlById[invitePreview.id] ? (
                                    <img src={conversationAvatarUrlById[invitePreview.id] ?? undefined} alt="" />
                                  ) : (
                                    <span>{conversationInitial(threadHeadConversation.title)}</span>
                                  )}
                                </div>
                                {threadHeadGcClosed ? <MessengerClosedGcLockBadge size="join" /> : null}
                              </div>
                              <p className="messenger-join-gate__eyebrow">
                                {threadHeadConversation.kind === 'channel' ? 'Канал' : 'Группа'}
                                {typeof invitePreview?.memberCount === 'number'
                                  ? ` · ${invitePreview.memberCount} участн.`
                                  : ''}
                              </p>
                              <h2 className="messenger-join-gate__title">{threadHeadConversation.title}</h2>
                              <p className="messenger-join-gate__text">
                                Закрытое сообщество. Отправьте заявку — администраторы примут решение и дадут доступ.
                              </p>
                              <button
                                type="button"
                                className="messenger-join-gate__cta"
                                onClick={() => void joinFromInvite()}
                                disabled={inviteJoinBusy || inviteLoading}
                              >
                                {inviteJoinBusy ? 'Отправка…' : 'Запросить вступление'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="dashboard-messenger__thread-body">
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
                              </div>
                              <button
                                type="button"
                                className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--tappable"
                                aria-label="Информация о чате"
                                onClick={() => void openConversationInfo(activeConversationId)}
                              >
                                <div className="dashboard-messenger__gc-avatar-lock-wrap dashboard-messenger__gc-avatar-lock-wrap--thread">
                                  <span className="dashboard-messenger__thread-head-center-avatar" aria-hidden>
                                    {conversationAvatarUrlById[activeConversationId] ? (
                                      <img src={conversationAvatarUrlById[activeConversationId] ?? undefined} alt="" />
                                    ) : (
                                      <span>{conversationInitial(threadHeadConversation.title)}</span>
                                    )}
                                  </span>
                                  {threadHeadGcClosed ? <MessengerClosedGcLockBadge size="thread" /> : null}
                                </div>
                                <div className="dashboard-messenger__thread-head-center-text">
                                  <div className="dashboard-messenger__thread-head-center-title">
                                    {threadHeadConversation.title}
                                  </div>
                                  <div className="dashboard-messenger__thread-head-center-meta">
                                    {(threadHeadConversation.kind === 'channel' ? 'Канал' : 'Группа') + ' · '}
                                    {threadHeadConversation.memberCount ?? 0} участн.
                                  </div>
                                </div>
                              </button>
                              <div className="dashboard-messenger__list-head-actions">
                                {bookmarksCount > 0 ? (
                                  <button
                                    type="button"
                                    className="dashboard-messenger__list-head-btn"
                                    onClick={() => setBookmarksOpen(true)}
                                    title="Закладки"
                                    aria-label="Закладки"
                                  >
                                    <FiRrIcon name="bookmark" />
                                  </button>
                                ) : null}
                                {canManageConversationJoinRequests ? (
                                  <button
                                    type="button"
                                    className="dashboard-messenger__list-head-btn dashboard-messenger__list-head-btn--icon-badge"
                                    onClick={() => setJoinRequestsOpen(true)}
                                    title="Запросы на вступление"
                                    aria-label="Запросы на вступление"
                                  >
                                    <JoinRequestsIcon />
                                    {conversationJoinRequests.length > 0 ? (
                                      <span className="dashboard-messenger__list-head-btn__badge">
                                        {conversationJoinRequests.length > 99 ? '99+' : conversationJoinRequests.length}
                                      </span>
                                    ) : null}
                                  </button>
                                ) : null}
                              </div>
                            </header>
                          ) : (
                            <div className="dashboard-messenger__thread-head-main-desktop">
                              <button
                                type="button"
                                className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--tappable"
                                aria-label="Информация о чате"
                                onClick={() => void openConversationInfo(activeConversationId)}
                              >
                                <div className="dashboard-messenger__gc-avatar-lock-wrap dashboard-messenger__gc-avatar-lock-wrap--thread">
                                  <span className="dashboard-messenger__thread-head-center-avatar" aria-hidden>
                                    {conversationAvatarUrlById[activeConversationId] ? (
                                      <img src={conversationAvatarUrlById[activeConversationId] ?? undefined} alt="" />
                                    ) : (
                                      <span>{conversationInitial(threadHeadConversation.title)}</span>
                                    )}
                                  </span>
                                  {threadHeadGcClosed ? <MessengerClosedGcLockBadge size="thread" /> : null}
                                </div>
                                <div className="dashboard-messenger__thread-head-center-text">
                                  <div className="dashboard-messenger__thread-head-center-title">
                                    {threadHeadConversation.title}
                                  </div>
                                  <div className="dashboard-messenger__thread-head-center-meta">
                                    {(threadHeadConversation.kind === 'channel' ? 'Канал' : 'Группа') + ' · '}
                                    {threadHeadConversation.memberCount ?? 0} участн.
                                  </div>
                                </div>
                              </button>
                              <div className="dashboard-messenger__thread-head-actions-desktop">
                                {bookmarksCount > 0 ? (
                                  <button
                                    type="button"
                                    className="dashboard-topbar__action"
                                    onClick={() => setBookmarksOpen(true)}
                                    title="Закладки"
                                    aria-label="Закладки"
                                  >
                                    <FiRrIcon name="bookmark" />
                                  </button>
                                ) : null}
                                {canManageConversationJoinRequests ? (
                                  <button
                                    type="button"
                                    className="dashboard-topbar__action"
                                    onClick={() => setJoinRequestsOpen(true)}
                                    title="Запросы на вступление"
                                    aria-label="Запросы на вступление"
                                  >
                                    <JoinRequestsIcon />
                                    {conversationJoinRequests.length > 0 ? (
                                      <span className="dashboard-topbar__badge">
                                        {conversationJoinRequests.length > 99 ? '99+' : conversationJoinRequests.length}
                                      </span>
                                    ) : null}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>

                        {canRequestJoin && !inviteJoinMode && !viewerOnly && pendingJoinRequest !== true ? (
                          <div className="messenger-join-gate messenger-join-gate--embed">
                            <div className="messenger-join-gate__card">
                              <div className="dashboard-messenger__gc-avatar-lock-wrap dashboard-messenger__gc-avatar-lock-wrap--join">
                                <div className="messenger-join-gate__avatar" aria-hidden>
                                  {conversationAvatarUrlById[activeConversationId] ? (
                                    <img src={conversationAvatarUrlById[activeConversationId] ?? undefined} alt="" />
                                  ) : (
                                    <span>{conversationInitial(threadHeadConversation.title)}</span>
                                  )}
                                </div>
                                {threadHeadGcClosed ? <MessengerClosedGcLockBadge size="join" /> : null}
                              </div>
                              <p className="messenger-join-gate__eyebrow">
                                {threadHeadConversation.kind === 'channel' ? 'Канал' : 'Группа'}
                                {` · ${threadHeadConversation.memberCount ?? 0} участн.`}
                              </p>
                              <h2 className="messenger-join-gate__title">{threadHeadConversation.title}</h2>
                              <p className="messenger-join-gate__text">
                                Чтобы видеть переписку, отправьте заявку — после одобрения администратором чат откроется
                                полностью.
                              </p>
                              <button
                                type="button"
                                className="messenger-join-gate__cta"
                                onClick={() => void joinOpenConversation()}
                                disabled={joinActionDisabled || inviteLoading}
                              >
                                {joinActionDisabled ? '…' : joinActionLabel}
                              </button>
                            </div>
                          </div>
                        ) : threadHeadConversation.kind === 'group' ? (
                          <GroupThreadPane
                            conversationId={activeConversationId}
                            messengerOnline={isOnline}
                            isMemberHint={isMemberOfActiveConversation}
                            viewerOnly={viewerOnly}
                            publicJoinCta={publicBrowseJoinCta}
                            joinRequestPending={pendingJoinRequest === true}
                            jumpToMessageId={
                              pendingJump && pendingJump.conversationId.trim() === activeConversationId.trim()
                                ? pendingJump.messageId
                                : null
                            }
                            onJumpHandled={() => setPendingJump(null)}
                            onTouchTail={(patch) => {
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === activeConversationId
                                    ? { ...it, lastMessageAt: patch.lastMessageAt, lastMessagePreview: patch.lastMessagePreview }
                                    : it,
                                ),
                              )
                            }}
                            onForwardMessage={handleForwardFromGroupMessage}
                            onSaveMessage={(m) => saveMessageFromActiveConversation(m)}
                            onForwardSourceNavigate={onMessengerForwardSourceNavigate}
                            onMentionSlug={onMentionSlugOpenProfile}
                          />
                        ) : (
                          <ChannelThreadPane
                            conversationId={activeConversationId}
                            messengerOnline={isOnline}
                            isMemberHint={isMemberOfActiveConversation}
                            postingMode={threadHeadConversation?.postingMode}
                            viewerOnly={viewerOnly}
                            publicJoinCta={publicBrowseJoinCta}
                            joinRequestPending={pendingJoinRequest === true}
                            onMentionSlug={onMentionSlugOpenProfile}
                            jumpToMessageId={
                              pendingJump && pendingJump.conversationId.trim() === activeConversationId.trim()
                                ? pendingJump.messageId
                                : null
                            }
                            jumpToParentMessageId={
                              pendingJump && pendingJump.conversationId.trim() === activeConversationId.trim()
                                ? pendingJump.parentMessageId ?? null
                                : null
                            }
                            onJumpHandled={() => setPendingJump(null)}
                            onTouchTail={(patch) => {
                              setItems((prev) =>
                                prev.map((it) =>
                                  it.id === activeConversationId
                                    ? { ...it, lastMessageAt: patch.lastMessageAt, lastMessagePreview: patch.lastMessagePreview }
                                    : it,
                                ),
                              )
                            }}
                            onForwardMessage={handleForwardFromChannelMessage}
                            onSaveMessage={(m, ctx) =>
                              saveMessageFromActiveConversation(m, { channelParentPostId: ctx.parentPostId ?? null })
                            }
                            onForwardSourceNavigate={onMessengerForwardSourceNavigate}
                          />
                        )}
                      </div>
                    )
                  ) : (
                  <DirectThreadPane>
                    <MessengerDirectThreadBody
                      isMobileMessenger={isMobileMessenger}
                      onForwardSourceNavigate={onMessengerForwardSourceNavigate}
                      navigate={navigate}
                      totalOtherUnread={totalOtherUnread}
                      bookmarksCount={bookmarksCount}
                      bookmarksPeerNewCount={bookmarksPeerNewCount}
                      onOpenBookmarks={openBookmarks}
                      directPeerLastReadAt={directPeerLastReadAt}
                      viewerDmReceiptsPrivate={profile?.profile_dm_receipts_private === true}
                      peerDmReceiptsPrivate={directPeerReceiptsPrivate}
                      directPeerPresenceDisplay={directPeerPresenceDisplay}
                      directPeerLastActivityAt={directPeerLastActivityAt}
                      directPeerShowLastActivity={directPeerShowLastActivity}
                      threadHeadConversation={threadHeadConversation as MessengerDirectThreadHeadConversation}
                      openUserPeek={openUserPeek}
                      user={user}
                      profile={profile}
                      activeAvatarUrl={activeAvatarUrl}
                      isMemberOfActiveConversation={isMemberOfActiveConversation}
                      goCreateRoomFromMessenger={goCreateRoomFromMessenger}
                      messagesScrollRef={messagesScrollRef}
                      readTailRef={dmReadTailRef}
                      onMessagesScroll={onMessagesScroll}
                      loadingOlder={loadingOlder}
                      messagesContentRef={messagesContentRef}
                      threadLoading={threadLoading}
                      timelineMessages={timelineMessages}
                      reactionsByTargetId={reactionsByTargetId}
                      messages={messages}
                      userId={user?.id}
                      onMentionSlugOpenProfile={onMentionSlugOpenProfile}
                      scrollToQuotedMessage={scrollToQuotedMessage}
                      bindMessageAnchor={bindMessageAnchor}
                      messageMenu={messageMenu}
                      setMessageMenu={setMessageMenu}
                      closeMessageActionMenu={closeMessageActionMenu}
                      setMessengerImageLightbox={setMessengerImageLightbox}
                      bumpScrollIfPinned={bumpScrollIfPinned}
                      toggleMessengerReaction={toggleMessengerReaction}
                      setReplyTo={setReplyTo}
                      composerTextareaRef={composerTextareaRef}
                      showDmJump={showDmJump}
                      jumpDmBottom={jumpDmBottom}
                      composer={dmComposerNode}
                      messageActionMenu={dmMessageActionMenuNode}
                    />
                  </DirectThreadPane>

                  )
                ) : (
                  <div className="dashboard-chats-empty">Выберите диалог слева.</div>
                )}
              </div>
            ) : null}
          </div>

        </>
      </section>

      <MessengerDeleteChatDialog
        messengerDeleteUi={messengerDeleteUi}
        deleteChatBusy={deleteChatBusy}
        deleteFlowPurgeGcKind={deleteFlowPurgeGcKind}
        onBackdropClose={() => {
          if (!deleteChatBusy) {
            setMessengerDeleteUi(null)
            setDeleteFlowConversationId(null)
          }
        }}
        onCancelDmPick={() => {
          setMessengerDeleteUi(null)
          setDeleteFlowConversationId(null)
        }}
        onPickDmMe={() => setMessengerDeleteUi({ step: 'confirm', kind: 'dm-me' })}
        onPickDmAll={() => setMessengerDeleteUi({ step: 'confirm', kind: 'dm-all' })}
        onBackOrCancelConfirm={() => {
          if (!messengerDeleteUi || messengerDeleteUi.step !== 'confirm') return
          if (messengerDeleteUi.kind === 'dm-me' || messengerDeleteUi.kind === 'dm-all') {
            setMessengerDeleteUi({ step: 'dm-pick' })
          } else {
            setMessengerDeleteUi(null)
            setDeleteFlowConversationId(null)
          }
        }}
        onConfirm={() => {
          if (!messengerDeleteUi || messengerDeleteUi.step !== 'confirm') return
          void executeDeleteChatAction(messengerDeleteUi.kind)
        }}
      />

      <MessengerForwardToDmModal
        open={forwardDmModal !== null}
        onClose={() => {
          if (!forwardDmSending) {
            setForwardDmModal(null)
            setForwardDmComment('')
            setForwardDmShowSource(true)
          }
        }}
        items={forwardDmPickItems}
        excludeConversationId={forwardDmModal?.excludeConversationId ?? null}
        comment={forwardDmComment}
        onCommentChange={setForwardDmComment}
        showSourceLine={forwardDmShowSource}
        onShowSourceLineChange={setForwardDmShowSource}
        onSend={(ids) => void finishForwardToDms(ids)}
        sending={forwardDmSending}
      />

      <MessengerBookmarkScopeDialog
        open={dmBookmarkScopePick !== null}
        busy={dmBookmarkBusy}
        onClose={() => {
          if (!dmBookmarkBusy) setDmBookmarkScopePick(null)
        }}
        onPickMe={() => {
          const mid = dmBookmarkScopePick?.messageId?.trim() ?? ''
          if (!mid || dmBookmarkBusy) return
          setDmBookmarkBusy(true)
          void (async () => {
            try {
              const res = await bookmarkMessage(mid, 'me')
              toast.push({
                tone: res.ok ? 'success' : 'error',
                message: res.ok ? 'Добавлено в закладки' : 'Не удалось добавить в закладки',
                ms: 2400,
              })
              if (res.ok) {
                const cid = activeConversationId.trim()
                if (cid) {
                  const c = await countMessageBookmarks(cid)
                  if (!c.error && typeof c.data === 'number') setBookmarksCount(Math.max(0, c.data))
                }
              }
              setDmBookmarkScopePick(null)
            } finally {
              setDmBookmarkBusy(false)
            }
          })()
        }}
        onPickAll={() => {
          const mid = dmBookmarkScopePick?.messageId?.trim() ?? ''
          if (!mid || dmBookmarkBusy) return
          setDmBookmarkBusy(true)
          void (async () => {
            try {
              const res = await bookmarkMessage(mid, 'all')
              toast.push({
                tone: res.ok ? 'success' : 'error',
                message: res.ok ? 'Добавлено в закладки' : 'Не удалось добавить в закладки',
                ms: 2400,
              })
              if (res.ok) {
                const cid = activeConversationId.trim()
                if (cid) {
                  const c = await countMessageBookmarks(cid)
                  if (!c.error && typeof c.data === 'number') setBookmarksCount(Math.max(0, c.data))
                }
              }
              setDmBookmarkScopePick(null)
            } finally {
              setDmBookmarkBusy(false)
            }
          })()
        }}
      />

      <MessengerBookmarksModal
        open={bookmarksOpen}
        conversationId={activeConversationId}
        conversationKind={
          threadHeadConversation?.kind === 'group'
            ? 'group'
            : threadHeadConversation?.kind === 'channel'
              ? 'channel'
              : 'direct'
        }
        onClose={() => setBookmarksOpen(false)}
        onNavigateToMessage={({ messageId, parentMessageId }) => {
          const cid = activeConversationId.trim()
          if (!cid || !messageId.trim()) return
          navigate(
            buildMessengerUrl(cid, undefined, undefined, {
              messageId: messageId.trim(),
              ...(parentMessageId?.trim() ? { parentMessageId: parentMessageId.trim() } : {}),
            }),
          )
        }}
        onCopyText={(text) => copyTextToClipboard(text)}
        onToast={({ tone, message, ms }) => toast.push({ tone, message, ms: ms ?? 2400 })}
        onDeleted={() => setBookmarksCount((p) => Math.max(0, p - 1))}
      />

      <MessengerJoinRequestsModal
        open={joinRequestsOpen}
        onClose={() => setJoinRequestsOpen(false)}
        joinRequestsLoading={joinRequestsLoading}
        membersLoading={membersLoading}
        conversationJoinRequests={conversationJoinRequests}
        conversationMembers={conversationMembers}
        joinRequestInFlight={joinRequestInFlight}
        activeConversationRole={activeConversationRole}
        currentUserId={user?.id ?? null}
        kickMemberBusyId={kickMemberBusyId}
        onApproveRequest={(id) => void approveJoinRequest(id)}
        onDenyRequest={(id) => void denyJoinRequest(id)}
        onKickMember={(id) => void kickConversationMember(id)}
      />

      <MessengerChatListRowMenuPortal
        menu={chatListRowMenu}
        onClose={() => setChatListRowMenu(null)}
        pinned={Boolean(chatListRowMenu && pinnedChatIds.includes(chatListRowMenu.item.id))}
        pinDisabled={Boolean(
          chatListRowMenu &&
            !pinnedChatIds.includes(chatListRowMenu.item.id) &&
            pinnedChatIds.length >= MESSENGER_MAX_PINNED_CHATS,
        )}
        onTogglePin={() => {
          if (chatListRowMenu) togglePinChatListItem(chatListRowMenu.item.id)
        }}
        onMarkRead={() => {
          if (chatListRowMenu) void markChatReadFromListMenu(chatListRowMenu.item)
        }}
        onDeleteChat={
          user?.id && chatListRowMenu && !chatListRowMenu.item.joinRequestPending
            ? () => {
                if (chatListRowMenu) void beginDeleteChatFromListItem(chatListRowMenu.item)
              }
            : undefined
        }
      />

      <MessengerImageLightbox
        open={Boolean(messengerImageLightbox && messengerImageLightbox.urls.length > 0)}
        urls={messengerImageLightbox?.urls ?? []}
        initialIndex={messengerImageLightbox?.index ?? 0}
        onClose={closeMessengerImageLightbox}
      />

      <MessengerConversationInfoModal
        open={Boolean(conversationInfoOpen && conversationInfoConv)}
        conversation={conversationInfoConv}
        avatarUrl={
          conversationInfoConv ? conversationAvatarUrlById[conversationInfoConv.id] ?? null : null
        }
        notificationsMuted={conversationInfoNotificationsMuted}
        notificationsMuteBusy={conversationInfoNotificationsBusy}
        onToggleNotificationsMuted={(next) => void toggleConversationNotificationsMuted(next)}
        conversationInfoError={conversationInfoError}
        conversationInfoLoading={conversationInfoLoading}
        conversationInfoEdit={conversationInfoEdit}
        setConversationInfoEdit={setConversationInfoEdit}
        conversationInfoTitle={conversationInfoTitle}
        setConversationInfoTitle={setConversationInfoTitle}
        conversationInfoNick={conversationInfoNick}
        setConversationInfoNick={setConversationInfoNick}
        conversationInfoIsOpen={conversationInfoIsOpen}
        setConversationInfoIsOpen={setConversationInfoIsOpen}
        conversationInfoChannelComments={conversationInfoChannelComments}
        setConversationInfoChannelComments={setConversationInfoChannelComments}
        conversationInfoLogoFile={conversationInfoLogoFile}
        setConversationInfoLogoFile={setConversationInfoLogoFile}
        conversationInfoRole={conversationInfoRole}
        conversationStaffRows={conversationStaffRows}
        conversationStaffLoading={conversationStaffLoading}
        conversationStaffTargetUserId={conversationStaffTargetUserId}
        setConversationStaffTargetUserId={setConversationStaffTargetUserId}
        conversationStaffNewRole={conversationStaffNewRole}
        setConversationStaffNewRole={setConversationStaffNewRole}
        conversationStaffMutating={conversationStaffMutating}
        leaveError={leaveError}
        leaveBusy={leaveBusy}
        leaveConfirmOpen={leaveConfirmOpen}
        setLeaveConfirmOpen={setLeaveConfirmOpen}
        onClose={closeConversationInfo}
        onShareInvite={() => void shareConversationInvite()}
        onSave={() => void saveConversationInfo()}
        onCancelEdit={cancelConversationInfoEdit}
        onApplyStaffRole={() => void applyConversationStaffRole()}
        onLeaveConfirm={() => void confirmLeaveConversation()}
      />

      <MessengerCreateConversationModal
        open={createModalOpen}
        onClose={closeCreateConversationModal}
        createError={createError}
        createKind={createKind}
        setCreateKind={setCreateKind}
        createBusy={createBusy}
        createIsOpen={createIsOpen}
        setCreateIsOpen={setCreateIsOpen}
        createTitle={createTitle}
        setCreateTitle={setCreateTitle}
        createNick={createNick}
        setCreateNick={setCreateNick}
        createLogoFile={createLogoFile}
        setCreateLogoFile={setCreateLogoFile}
        createChannelComments={createChannelComments}
        setCreateChannelComments={setCreateChannelComments}
        onSubmit={() => void submitCreateConversation()}
      />

      <MessengerSettingsModal
        open={messengerSettingsOpen}
        onClose={() => setMessengerSettingsOpen(false)}
        messengerFontPreset={messengerFontPreset}
        setMessengerFontPreset={setMessengerFontPreset}
        setMessengerFontPresetState={setMessengerFontPresetState}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        setMessengerSoundEnabled={setMessengerSoundEnabled}
        pushUi={pushUi}
        pushBusy={pushBusy}
        onTogglePush={() => {
          void toggleMessengerPush()
        }}
      />

    </DashboardShell>
  )
}
