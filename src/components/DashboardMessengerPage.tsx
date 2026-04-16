import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  MESSENGER_BG_MESSAGE_EVENT,
  type MessengerBgMessageDetail,
} from '../lib/messengerUnreadRealtime'
import {
  isMessengerSoundEnabled,
  playMessageSound,
  setMessengerSoundEnabled,
  unlockAudioContext,
} from '../lib/messengerSound'
import {
  disableMessengerPush,
  enableMessengerPush,
  isMessengerPushSubscribed,
  isMessengerWebPushConfigured,
  isWebPushApiSupported,
  reconcileMessengerPushSubscription,
} from '../lib/messengerWebPush'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useProfile } from '../hooks/useProfile'
import { useToast } from '../context/ToastContext'
import {
  appendDirectMessage,
  editDirectMessage,
  type DirectConversationSummary,
  type DirectMessage,
  ensureDirectConversationWithUser,
  ensureSelfDirectConversation,
  getDirectConversationForUser,
  isDirectReactionEmoji,
  listDirectMessagesPage,
  mapDirectMessageFromRow,
  deleteDirectMessage,
  markDirectConversationRead,
  previewTextForDirectMessageTail,
  requestMessengerUnreadRefresh,
  toggleDirectMessageReaction,
  uploadMessengerImage,
  getMessengerImageSignedUrl,
  isDmSoftDeletedStub,
} from '../lib/messenger'
import {
  buildJoinRequestPendingSidebarStub,
  listMessengerConversations,
  type MessengerConversationKind,
  type MessengerConversationSummary,
} from '../lib/messengerConversations'
import {
  listConversationStaffMembers,
  setConversationMemberStaffRole,
  type ConversationStaffMember,
  type ConversationStaffRole,
} from '../lib/conversationStaff'
import {
  listConversationMembersForManagement,
  removeConversationMemberByStaff,
  type ConversationMemberRow,
} from '../lib/conversationMembers'
import {
  createGroupChat,
  getOrCreateConversationInvite,
  joinConversationByInvite,
  leaveGroupChat,
  joinPublicGroupChat,
  resolveConversationByInvite,
  updateGroupProfile,
  type InviteConversationPreview,
} from '../lib/groups'
import { createChannel, joinPublicChannel, leaveChannel, updateChannelProfile } from '../lib/channels'
import {
  getMessengerFontPreset,
  resolveQuotedAvatarForDm,
  setMessengerFontPreset,
  truncateMessengerReplySnippet,
  type MessengerFontPreset,
} from '../lib/messengerUi'
import { buildQuotePreview } from '../lib/messengerQuotePreview'
import {
  approveConversationJoinRequest,
  denyConversationJoinRequest,
  hasPendingConversationJoinRequest,
  listConversationJoinRequests,
  requestConversationJoin,
  type ConversationJoinRequest,
} from '../lib/chatRequests'
import {
  buildForwardMetaFromChannelOrGroup,
  buildForwardMetaFromDirectMessage,
  forwardMetaToQuotedStrip,
} from '../lib/messengerForward'
import type { MessengerForwardMeta } from '../lib/messenger'
import { MESSENGER_COMPOSER_EMOJIS } from '../lib/messengerComposerEmojis'
import { setPendingHostClaim, stashSpaceRoomCreateOptions } from '../lib/spaceRoom'
import { getContactStatuses, setContactPin, type ContactStatus } from '../lib/socialGraph'
import { supabase } from '../lib/supabase'
import { newRoomId } from '../utils/roomId'
import { BrandLogoLoader } from './BrandLogoLoader'
import {
  AdminPanelIcon,
  AttachmentIcon,
  BellIcon,
  BellOffIcon,
  FiRrIcon,
  ChevronLeftIcon,
  DashboardIcon,
  HomeIcon,
  JoinRequestsIcon,
  LogOutIcon,
  MenuBurgerIcon,
  ParticipantsBadgeIcon,
  PlusIcon,
  XCloseIcon,
  RoomsIcon,
} from './icons'
import { DashboardShell } from './DashboardShell'
import { MessengerForwardToDmModal } from './MessengerForwardToDmModal'
import { MessengerMessageMenuPopover } from './MessengerMessageMenuPopover'
import { MessengerReplyMiniThumb } from './MessengerReplyMiniThumb'
import { PillToggle } from './PillToggle'
import { ReactionEmojiPopover } from './ReactionEmojiPopover'
import { ThreadMessageBubble } from './messenger/ThreadMessageBubble'
import type { ReactionEmoji } from '../types/roomComms'
import { DirectThreadPane } from './messenger/DirectThreadPane'
import { GroupThreadPane } from './messenger/GroupThreadPane'
import { ChannelThreadPane } from './messenger/ChannelThreadPane'
import { DoubleTapHeartSurface } from './messenger/DoubleTapHeartSurface'

/** Роли, которым доступна очередь запросов на вступление в группу/канал. */
const MESSENGER_JOIN_REQUEST_MANAGER_ROLES = new Set(['owner', 'admin', 'moderator'])

function formatDateTime(value: string): string {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Время в строке списка чатов: сегодня — только часы, иначе короткая дата + время. */
function formatMessengerListRowTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const now = new Date()
  const sameDay =
    dt.getDate() === now.getDate() &&
    dt.getMonth() === now.getMonth() &&
    dt.getFullYear() === now.getFullYear()
  if (sameDay) {
    return dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return dt.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function conversationInitial(title: string): string {
  return (title.trim().charAt(0) || 'С').toUpperCase()
}

const MESSENGER_LAST_OPEN_KEY = 'vmix.messenger.lastOpenConversation'
const DM_PAGE_SIZE = 50
/** Лимит размера фото в мессенджере (клиент). */
const MESSENGER_PHOTO_MAX_BYTES = 2 * 1024 * 1024
/** Ниже этой дистанции от низа считаем, что пользователь «на хвосте» — догоняем при подгрузке картинок и т.п. */
const MESSENGER_BOTTOM_PIN_PX = 200
/** Сжимаем частые mark read при пачке входящих в открытом треде. */
const MARK_DIRECT_READ_DEBOUNCE_MS = 400

function sortDirectMessagesChrono(a: DirectMessage, b: DirectMessage): number {
  const ta = new Date(a.createdAt).getTime()
  const tb = new Date(b.createdAt).getTime()
  if (ta !== tb) return ta - tb
  return a.id.localeCompare(b.id)
}

function sortConversationsByActivity(list: MessengerConversationSummary[]): MessengerConversationSummary[] {
  return [...list].sort((a, b) => {
    const aTs = new Date(a.lastMessageAt ?? a.createdAt).getTime()
    const bTs = new Date(b.lastMessageAt ?? b.createdAt).getTime()
    return bTs - aTs
  })
}

function normalizeMessengerListSearch(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function itemMatchesMessengerListSearch(item: MessengerConversationSummary, needle: string): boolean {
  if (!needle) return true
  const title = item.title.toLowerCase()
  const preview = (item.lastMessagePreview ?? '').toLowerCase()
  return title.includes(needle) || preview.includes(needle)
}

function memberKickAllowed(callerRole: string | null, myUserId: string | null, m: ConversationMemberRow): boolean {
  if (!myUserId || m.userId === myUserId) return false
  if (m.role === 'owner') return false
  if (callerRole === 'owner') return true
  if (callerRole === 'admin') return m.role === 'member' || m.role === 'moderator'
  return false
}

/** Последнее text/system в треде — для превью в списке (реакции не считаются «последним сообщением»). */
function lastNonReactionBody(rows: DirectMessage[]): string | null {
  const sorted = [...rows].sort(sortDirectMessagesChrono)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i]!
    if (m.kind === 'text' || m.kind === 'system') return m.body
    if (m.kind === 'image') return previewTextForDirectMessageTail(m)
  }
  return null
}

/** URL пустой: последний открытый диалог из localStorage, иначе самый свежий по активности, иначе запасной id (напр. «с собой»). */
function pickDefaultConversationId(
  list: MessengerConversationSummary[],
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

const LIGHTBOX_SWIPE_CLOSE_PX = 52

/** Двойной тап / двойной клик по пузырю: «лайк», не 👍. */
const QUICK_REACTION_EMOJI: ReactionEmoji = '❤️'

async function copyTextToClipboard(text: string): Promise<boolean> {
  const v = text ?? ''
  if (!v) return false
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(v)
      return true
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = v
    ta.setAttribute('readonly', 'true')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, ta.value.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

function messengerStaffRoleShortLabel(role: string): string {
  switch (role) {
    case 'admin':
      return 'админ'
    case 'moderator':
      return 'модератор'
    default:
      return 'участник'
  }
}

export function DashboardMessengerPage() {
  const toast = useToast()
  const { conversationId: rawConversationId } = useParams<{ conversationId?: string }>()
  const routeConversationId = rawConversationId?.trim() ?? ''
  const [searchParams] = useSearchParams()
  const searchConversationId = searchParams.get('chat')?.trim() ?? ''
  const inviteToken = searchParams.get('invite')?.trim() ?? ''
  const urlConversationId = searchConversationId || routeConversationId
  const targetUserId = searchParams.get('with')?.trim() ?? ''
  const targetTitle = searchParams.get('title')?.trim() ?? ''
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { openUserPeek } = useUserPeek()
  const { profile } = useProfile()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const isMobileMessenger = useMediaQuery('(max-width: 900px)')
  const [soundEnabled, setSoundEnabled] = useState(() => isMessengerSoundEnabled())
  const [messengerFontPreset, setMessengerFontPresetState] = useState<MessengerFontPreset>(() =>
    getMessengerFontPreset(),
  )
  const [messengerSettingsOpen, setMessengerSettingsOpen] = useState(false)
  const [messengerMenuOpen, setMessengerMenuOpen] = useState(false)
  const [chatListSearch, setChatListSearch] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createKind, setCreateKind] = useState<'group' | 'channel'>('group')
  const [createIsOpen, setCreateIsOpen] = useState(true)
  const [createTitle, setCreateTitle] = useState('')
  const [createNick, setCreateNick] = useState('')
  const [createLogoFile, setCreateLogoFile] = useState<File | null>(null)
  const [createChannelComments, setCreateChannelComments] = useState<'comments' | 'reactions_only'>('comments')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [invitePreview, setInvitePreview] = useState<InviteConversationPreview | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteJoinBusy, setInviteJoinBusy] = useState(false)
  /** Мобильный режим «только дерево чатов» — не подставлять chat в URL и не грузить тред */
  const listOnlyMobile = isMobileMessenger && searchParams.get('view') === 'list'
  const conversationId = inviteToken && invitePreview?.id ? invitePreview.id : urlConversationId

  const [pushUi, setPushUi] = useState<'absent' | 'unconfigured' | 'off' | 'on' | 'denied'>('absent')
  const [pushBusy, setPushBusy] = useState(false)

  const refreshPushUi = useCallback(async () => {
    if (!user?.id || !isWebPushApiSupported()) {
      setPushUi('absent')
      return
    }
    if (!isMessengerWebPushConfigured()) {
      setPushUi('unconfigured')
      return
    }
    if (Notification.permission === 'denied') {
      setPushUi('denied')
      return
    }

    const reconciled = await reconcileMessengerPushSubscription(user.id)
    if (!reconciled.ok && reconciled.error) {
      setError(reconciled.error)
    }
    if (reconciled.state === 'denied') {
      setPushUi('denied')
      return
    }

    const subbed = await isMessengerPushSubscribed()
    setPushUi(subbed ? 'on' : 'off')
  }, [user?.id])

  useEffect(() => {
    void refreshPushUi()
  }, [refreshPushUi])

  const toggleMessengerPush = useCallback(async () => {
    if (!user?.id || pushUi === 'absent' || pushUi === 'unconfigured' || pushBusy) return
    unlockAudioContext()
    if (pushUi === 'denied') return
    if (pushUi === 'on') {
      setPushBusy(true)
      try {
        const res = await disableMessengerPush(user.id)
        if (!res.ok) {
          setError(res.error ?? 'Не удалось отключить push')
          await refreshPushUi()
          return
        }
        setPushUi('off')
      } finally {
        setPushBusy(false)
      }
      return
    }
    setPushBusy(true)
    try {
      const res = await enableMessengerPush(user.id)
      if (!res.ok) {
        if (res.error === 'permission_denied') setPushUi('denied')
        else setError(res.error ?? 'Не удалось включить push')
        await refreshPushUi()
        return
      }
      setPushUi('on')
    } finally {
      setPushBusy(false)
    }
  }, [user?.id, pushUi, pushBusy, refreshPushUi])

  const [loading, setLoading] = useState(true)
  const [threadLoading, setThreadLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<MessengerConversationSummary[]>([])
  /** Чаты с отправленной заявкой: держим строку в дереве до появления в ответе сервера. */
  const [pendingJoinSidebarById, setPendingJoinSidebarById] = useState<
    Record<string, MessengerConversationSummary>
  >({})
  const [conversationAvatarUrlById, setConversationAvatarUrlById] = useState<Record<string, string>>({})
  const [activeConversation, setActiveConversation] = useState<MessengerConversationSummary | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let active = true
    if (!user?.id) {
      setInvitePreview(null)
      setInviteError(null)
      setInviteLoading(false)
      return
    }
    const token = inviteToken.trim()
    if (!token) {
      setInvitePreview(null)
      setInviteError(null)
      setInviteLoading(false)
      return
    }
    setInviteLoading(true)
    setInviteError(null)
    void resolveConversationByInvite(token).then((res) => {
      if (!active) return
      setInviteLoading(false)
      if (res.error) {
        setInvitePreview(null)
        setInviteError(res.error)
        return
      }
      setInvitePreview(res.data)
    })
    return () => {
      active = false
    }
  }, [inviteToken, user?.id])

  useEffect(() => {
    const cid = invitePreview?.id?.trim()
    const token = inviteToken.trim()
    if (!token || !cid) return
    if (items.some((i) => i.id === cid)) {
      navigate(`/dashboard/messenger/${encodeURIComponent(cid)}`, { replace: true })
    }
  }, [invitePreview?.id, inviteToken, items, navigate])

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
  /** Ответ на сообщение (цитата над композером). */
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null)
  /** Редактирование своего сообщения: id сообщения. */
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false)
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  /** Меню «⋯» у сообщения: якорь и данные для поповера */
  const [messageMenu, setMessageMenu] = useState<{
    message: DirectMessage
    mode: 'kebab' | 'context'
    anchorX: number
    anchorY: number
  } | null>(null)
  const [forwardDmModal, setForwardDmModal] = useState<{ forward: MessengerForwardMeta; sendBody: string } | null>(null)
  const [forwardDmComment, setForwardDmComment] = useState('')
  const [forwardDmSending, setForwardDmSending] = useState(false)
  const [pendingJump, setPendingJump] = useState<{
    conversationId: string
    messageId: string
    parentMessageId?: string | null
    conversationKind?: MessengerConversationKind
    sourceTitle?: string
    sourceAvatarUrl?: string | null
  } | null>(null)
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
  const [messengerImageLightboxUrl, setMessengerImageLightboxUrl] = useState<string | null>(null)
  const messengerLightboxSwipeRef = useRef<{
    pointerId: number | null
    x0: number
    y0: number
    active: boolean
  }>({ pointerId: null, x0: 0, y0: 0, active: false })
  const messengerLightboxFrameRef = useRef<HTMLDivElement | null>(null)
  const [senderContactByUserId, setSenderContactByUserId] = useState<Record<string, ContactStatus>>({})
  const [pinBusyUserId, setPinBusyUserId] = useState<string | null>(null)
  /** Снятие реакции уже отразили в списке диалогов после RPC — пропускаем дубль из realtime DELETE. */
  const reactionDeleteSidebarSyncedRef = useRef(new Set<string>())

  // Convert inline messenger errors to project toasts.
  useEffect(() => {
    if (!error) return
    toast.push({ tone: 'error', message: error, ms: 3800 })
    setError(null)
  }, [error, toast])

  useEffect(() => {
    if (!inviteError) return
    toast.push({ tone: 'error', message: inviteError, ms: 3800 })
    setInviteError(null)
  }, [inviteError, toast])

  useEffect(() => {
    if (!joinRequestError) return
    toast.push({ tone: 'error', message: joinRequestError, ms: 3800 })
    setJoinRequestError(null)
  }, [joinRequestError, toast])

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
      const listRes = await listMessengerConversations()
      if (!listRes.error && listRes.data) setItems(listRes.data)
      navigate(`/dashboard/messenger/${encodeURIComponent(res.data.conversationId)}`, { replace: true })
    } finally {
      setInviteJoinBusy(false)
    }
  }, [inviteJoinBusy, invitePreview, inviteToken, navigate, setItems, setPendingJoinRequest, toast, user?.id])

  const messengerSenderUserIds = useMemo(() => {
    const s = new Set<string>()
    for (const m of messages) {
      const id = m.senderUserId?.trim()
      if (id && id !== (user?.id ?? '')) s.add(id)
    }
    return [...s]
  }, [messages, user?.id])

  useEffect(() => {
    let cancelled = false
    if (!user?.id || messengerSenderUserIds.length === 0) {
      setSenderContactByUserId({})
      return
    }
    void getContactStatuses(messengerSenderUserIds).then((result) => {
      if (cancelled || !result.data) return
      setSenderContactByUserId(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id, messengerSenderUserIds.join('|')])

  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId
  const itemsRef = useRef(items)
  itemsRef.current = items

  const mergedItems = useMemo(() => {
    const out = [...items]
    const ids = new Set(items.map((i) => i.id))
    for (const stub of Object.values(pendingJoinSidebarById)) {
      if (!ids.has(stub.id)) out.push(stub)
    }
    return out
  }, [items, pendingJoinSidebarById])

  const mergedItemsRef = useRef(mergedItems)
  mergedItemsRef.current = mergedItems

  useEffect(() => {
    setPendingJoinSidebarById((prev) => {
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(prev)) {
        if (items.some((i) => i.id === id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [items])
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const reactionOpInFlightRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    const run = async () => {
      const missing = (itemsRef.current ?? []).filter(
        (it) =>
          (it.kind === 'group' || it.kind === 'channel') &&
          Boolean(it.avatarThumbPath?.trim() || it.avatarPath?.trim()) &&
          !conversationAvatarUrlById[it.id],
      )
      if (missing.length === 0) return
      for (const it of missing) {
        const path = (it.avatarThumbPath?.trim() || it.avatarPath?.trim() || '').trim()
        if (!path) continue
        const signed = await getMessengerImageSignedUrl(path, 3600)
        if (!active) return
        if (signed.url) {
          setConversationAvatarUrlById((prev) => (prev[it.id] ? prev : { ...prev, [it.id]: signed.url! }))
        }
      }
    }
    void run()
    return () => {
      active = false
    }
  }, [items, conversationAvatarUrlById])
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  /** Контейнер с сообщениями — ResizeObserver ловит рост высоты после decode изображений. */
  const messagesContentRef = useRef<HTMLDivElement | null>(null)
  const messageAnchorRef = useRef<Map<string, HTMLElement>>(new Map())
  /** Пользователь у нижней границы ленты (обновляется в onScroll). */
  const messengerPinnedToBottomRef = useRef(true)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const composerEmojiWrapRef = useRef<HTMLDivElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const olderFetchInFlightRef = useRef(false)
  const pendingJumpOlderAttemptsRef = useRef(0)
  const prevThreadIdForClearRef = useRef<string | null>(null)
  const prevMessagesLenForScrollRef = useRef(0)
  /** Уже загруженные сообщения для этого id — не дергать API при повторном срабатывании эффекта (напр. loading). */
  const lastFetchedThreadIdRef = useRef<string | null>(null)
  /** После первой успешной загрузки списка — повторный bootstrap при «Назад к чатам» не нужен */
  const listLoadedOnceRef = useRef(false)
  const markReadDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const buildMessengerUrl = (chatId?: string, withUserId?: string, withTitle?: string) => {
    const params = new URLSearchParams()
    if (chatId) params.set('chat', chatId)
    if (withUserId) params.set('with', withUserId)
    if (withTitle) params.set('title', withTitle)
    const qs = params.toString()
    return qs ? `/dashboard/messenger?${qs}` : '/dashboard/messenger'
  }

  const navigateToForwardSource = useCallback(
    (forward: MessengerForwardMeta) => {
      const scid = forward.source_conversation_id?.trim() ?? ''
      const smid = forward.source_message_id?.trim() ?? ''
      const spid = forward.source_parent_message_id?.trim() ?? ''
      if (!scid || !smid) return
      setPendingJump({
        conversationId: scid,
        messageId: smid,
        parentMessageId: spid || null,
        conversationKind: forward.from === 'channel' || forward.from === 'group' ? forward.from : undefined,
        sourceTitle: forward.source_title?.trim() || undefined,
        sourceAvatarUrl: forward.source_avatar_url?.trim() || null,
      })
      navigate(buildMessengerUrl(scid))
    },
    [navigate],
  )

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

      if (isMobileMessenger) {
        const spBoot = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
        const hasChatBoot = Boolean(spBoot.get('chat')?.trim())
        const hasWithBoot = Boolean(spBoot.get('with')?.trim())
        if (!hasChatBoot && !hasWithBoot && spBoot.get('view') !== 'list') {
          navigate('/dashboard/messenger?view=list', { replace: true })
          if (active) setLoading(false)
          return
        }
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

      const listRes = await listMessengerConversations()
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
        setMessageMenu(null)
        return
      }

      const token = inviteToken.trim()
      const preview = invitePreview
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
      const startedTarget =
        conversationId.trim() || pickDefaultConversationId(mergedItemsRef.current, null) || ''
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
        // direct-only state: очищаем, чтобы не мешало UI других типов.
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
  }, [
    conversationId,
    inviteLoading,
    invitePreview,
    inviteToken,
    listOnlyMobile,
    loading,
    pendingJoinSidebarById,
    urlConversationId,
    user?.id,
  ])

  const activeConversationId = listOnlyMobile ? '' : conversationId || activeConversation?.id || ''
  const inviteJoinMode = Boolean(
    inviteToken.trim() &&
      invitePreview?.id &&
      activeConversationId === invitePreview.id &&
      !mergedItems.some((i) => i.id === invitePreview.id && !i.joinRequestPending) &&
      invitePreview.isPublic !== true,
  )

  useEffect(() => {
    let active = true
    const cid = activeConversationId.trim()
    if (!user?.id || !cid) {
      setActiveConversationRole(null)
      setPendingJoinRequest(null)
      return
    }

    setActiveConversationRoleLoading(true)
    setActiveConversationRole(null)
    setPendingJoinRequest(null)

    void Promise.all([
      supabase
        .from('chat_conversation_members')
        .select('role')
        .eq('conversation_id', cid)
        .eq('user_id', user.id)
        .maybeSingle(),
      hasPendingConversationJoinRequest(cid),
    ]).then(([memberRes, pendingRes]) => {
      if (!active) return
      if (!memberRes.error && memberRes.data) {
        const role = typeof (memberRes.data as { role?: unknown })?.role === 'string'
          ? String((memberRes.data as { role: string }).role).trim()
          : null
        setActiveConversationRole(role)
      } else {
        setActiveConversationRole(null)
      }
      if (pendingRes.error) {
        setPendingJoinRequest(null)
        setJoinRequestError(pendingRes.error)
      } else {
        setPendingJoinRequest(Boolean(pendingRes.data))
      }
    }).finally(() => {
      if (active) setActiveConversationRoleLoading(false)
    })

    return () => {
      active = false
    }
  }, [activeConversationId, user?.id])

  useEffect(() => {
    if (
      !user?.id ||
      !activeConversationId.trim() ||
      !activeConversationRole ||
      !MESSENGER_JOIN_REQUEST_MANAGER_ROLES.has(activeConversationRole)
    ) {
      setConversationJoinRequests([])
      setConversationMembers([])
      return
    }

    let active = true
    setJoinRequestsLoading(true)
    setConversationJoinRequests([])
    setMembersLoading(true)
    setConversationMembers([])

    void listConversationJoinRequests(activeConversationId.trim()).then((res) => {
      if (!active) return
      if (res.error) {
        setJoinRequestError(res.error)
        setConversationJoinRequests([])
      } else {
        setConversationJoinRequests(res.data ?? [])
      }
    }).finally(() => {
      if (active) setJoinRequestsLoading(false)
    })

    void listConversationMembersForManagement(activeConversationId.trim()).then((res) => {
      if (!active) return
      if (res.error) {
        setConversationMembers([])
      } else {
        setConversationMembers(res.data ?? [])
      }
    }).finally(() => {
      if (active) setMembersLoading(false)
    })

    return () => {
      active = false
    }
  }, [activeConversationId, activeConversationRole, user?.id])

  useEffect(() => {
    messengerPinnedToBottomRef.current = true
  }, [activeConversationId, listOnlyMobile])

  useEffect(() => {
    if (listOnlyMobile || !activeConversationId) return
    try {
      localStorage.setItem(MESSENGER_LAST_OPEN_KEY, activeConversationId)
    } catch {
      /* ignore */
    }
  }, [activeConversationId, listOnlyMobile])

  /** Рост ленты без нового сообщения (decode картинки, смена «Загрузка…» на img) — догоняем низ, если пользователь был у хвоста. */
  useEffect(() => {
    if (listOnlyMobile || typeof ResizeObserver === 'undefined') return
    const root = messagesContentRef.current
    if (!root || threadLoading) return

    const ro = new ResizeObserver(() => {
      if (!messengerPinnedToBottomRef.current) return
      const el = messagesScrollRef.current
      if (!el) return
      requestAnimationFrame(() => {
        if (!messengerPinnedToBottomRef.current) return
        el.scrollTop = el.scrollHeight
      })
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [activeConversationId, listOnlyMobile, threadLoading])

  const showListPane = !isMobileMessenger || !activeConversationId
  const showThreadPane = !isMobileMessenger || Boolean(activeConversationId)

  /** Новые сообщения в открытом треде без полной перезагрузки списка */
  useEffect(() => {
    const uid = user?.id
    const convId = activeConversationId
    if (!uid || !convId || listOnlyMobile) return
    const kind = itemsRef.current.find((i) => i.id === convId)?.kind ?? 'direct'
    if (kind !== 'direct') return

    let sawSubscribed = false

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
      const preview = previewTextForDirectMessageTail(msg)
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
          const skipSidebarBump = isOwn && (msg.kind === 'text' || msg.kind === 'reaction' || msg.kind === 'image')

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
                  (m.meta?.react_to ?? '') === (msg.meta?.react_to ?? '') &&
                  (m.replyToMessageId ?? '') === (msg.replyToMessageId ?? '') &&
                  JSON.stringify(m.meta ?? null) === JSON.stringify(msg.meta ?? null),
              )
              if (i !== -1) base = [...prev.slice(0, i), ...prev.slice(i + 1)]
            }
            const next = [...base, msg]
            next.sort(sortDirectMessagesChrono)
            return next
          })

          queueMicrotask(() => bumpScrollIfPinned())

          if (!skipSidebarBump) bumpSidebarForInsert(msg)
          /* Пока тред открыт: входящие от других не должны увеличивать непрочитанные (сервер + бейдж в шапке). */
          if (!isOwn) {
            if (markReadDebounceTimerRef.current) clearTimeout(markReadDebounceTimerRef.current)
            markReadDebounceTimerRef.current = setTimeout(() => {
              markReadDebounceTimerRef.current = null
              void markDirectConversationRead(convId)
            }, MARK_DIRECT_READ_DEBOUNCE_MS)
            /* Звук — только если вкладка не активна (пользователь видит переписку — достаточно). */
            if (document.hidden) playMessageSound()
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${convId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          if (!row?.id) return
          const msg = mapDirectMessageFromRow(row)
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)))
          queueMicrotask(() => bumpScrollIfPinned())
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sawSubscribed = true
          return
        }
        if (!sawSubscribed || (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT')) return
        void (async () => {
          const res = await listDirectMessagesPage(convId, { limit: DM_PAGE_SIZE })
          if (res.error || !res.data?.length) return
          mergeLatestPageIntoMessages(convId, res.data)
          bumpScrollIfPinned()
        })()
      })

    return () => {
      if (markReadDebounceTimerRef.current) {
        clearTimeout(markReadDebounceTimerRef.current)
        markReadDebounceTimerRef.current = null
        void markDirectConversationRead(convId)
      }
      void supabase.removeChannel(channel)
    }
  }, [activeConversationId, listOnlyMobile, user?.id, bumpScrollIfPinned, mergeLatestPageIntoMessages])

  /**
   * Фоновые диалоги: обновляем sidebar-превью и счётчик когда приходит сообщение
   * в конверсацию, которая сейчас не открыта (или открыт список без треда).
   */
  useEffect(() => {
    const uid = user?.id
    if (!uid) return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<MessengerBgMessageDetail>).detail
      const { conversationId: cid, senderUserId, kind, body, createdAt } = detail

      // Если тред открыт — per-thread subscription уже обработал это сообщение
      if (cid === activeConversationId && !listOnlyMobile) return
      // Реакции не меняют превью
      if (kind === 'reaction') return

      setItems((prev) => {
        const idx = prev.findIndex((item) => item.id === cid)
        if (idx === -1) {
          queueMicrotask(() => {
            void listMessengerConversations().then((r) => {
              if (!r.error && r.data) setItems(r.data)
            })
          })
          return prev
        }
        return prev.map((item) =>
          item.id === cid
            ? {
                ...item,
                lastMessageAt: createdAt,
                lastMessagePreview: body,
                unreadCount: senderUserId !== uid ? item.unreadCount + 1 : item.unreadCount,
                messageCount: item.messageCount + 1,
              }
            : item,
        )
      })

      if (senderUserId !== uid) playMessageSound()
    }

    window.addEventListener(MESSENGER_BG_MESSAGE_EVENT, handler)
    return () => window.removeEventListener(MESSENGER_BG_MESSAGE_EVENT, handler)
  }, [activeConversationId, listOnlyMobile, user?.id])

  const prevThreadLoadingRef = useRef(false)
  useLayoutEffect(() => {
    const wasLoading = prevThreadLoadingRef.current
    prevThreadLoadingRef.current = threadLoading
    if (wasLoading && !threadLoading && !listOnlyMobile && messages.length > 0) {
      const el = messagesScrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
        messengerPinnedToBottomRef.current = true
      }
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
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < MESSENGER_BOTTOM_PIN_PX
    if (nearBottom) {
      el.scrollTop = el.scrollHeight
      messengerPinnedToBottomRef.current = true
    }
  }, [messages.length, threadLoading, loadingOlder])

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
      setDraft('')
      setSending(false)
      queueMicrotask(() => composerTextareaRef.current?.focus())
      return
    }

    if (!trimmed) return

    setSending(true)
    const replyTarget = replyTo
    const replyId = replyTarget?.id ?? null
    const optimistic: DirectMessage = {
      id: `local-${Date.now()}`,
      senderUserId: user.id,
      senderNameSnapshot: 'Вы',
      kind: 'text',
      body: trimmed,
      createdAt: new Date().toISOString(),
      replyToMessageId: replyId,
    }
    setMessages((prev) => [...prev, optimistic])
    setDraft('')
    setReplyTo(null)

    const res = await appendDirectMessage(convId, trimmed, { replyToMessageId: replyId })
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

  const sendPhotoFile = async (file: File) => {
    const convId = activeConversationId.trim()
    if (!user?.id || !convId || photoUploading || threadLoading) return
    if (file.size > MESSENGER_PHOTO_MAX_BYTES) {
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
    const up = await uploadMessengerImage(convId, file)
    if (up.error) {
      setError(up.error)
      setPhotoUploading(false)
      return
    }
    const caption = draft.trim()
    const replyId = replyTo?.id ?? null
    const imageMeta = {
      image: {
        path: up.path!,
        ...(up.thumbPath ? { thumbPath: up.thumbPath } : {}),
      },
    }
    const res = await appendDirectMessage(convId, caption, {
      kind: 'image',
      meta: imageMeta,
      replyToMessageId: replyId,
    })
    if (res.error) {
      setError(res.error)
      setPhotoUploading(false)
      return
    }
    const preview = previewTextForDirectMessageTail({
      kind: 'image',
      body: caption,
      meta: imageMeta,
    })
    setDraft('')
    setReplyTo(null)
    setPhotoUploading(false)
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
      meta: { image: { path: up.path! } },
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
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
        messengerPinnedToBottomRef.current = true
      }
      refocusMessengerComposer()
    })
  }

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

  const [conversationKindFilter, setConversationKindFilter] = useState<
    'all' | MessengerConversationKind
  >('all')

  const sortedItems = useMemo(() => sortConversationsByActivity(mergedItems), [mergedItems])

  /** Шапка треда: сразу из списка по URL, пока грузится полная карточка с сервера */
  const threadHeadConversation =
    sortedItems.find((i) => i.id === activeConversationId) ?? activeConversation

  useEffect(() => {
    let active = true
    const cid = activeConversationId.trim()
    if (!user?.id || !cid) {
      setActiveConversationIsPublic(null)
      setActiveConversationIsPublicLoading(false)
      return
    }
    if (!threadHeadConversation || (threadHeadConversation.kind !== 'group' && threadHeadConversation.kind !== 'channel')) {
      setActiveConversationIsPublic(null)
      setActiveConversationIsPublicLoading(false)
      return
    }
    setActiveConversationIsPublicLoading(true)
    supabase
      .from('chat_conversations')
      .select('kind, group_is_public, channel_is_public')
      .eq('id', cid)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (!active) return
          if (error || !data) {
            setActiveConversationIsPublic(null)
            return
          }
          const row = data as { kind?: unknown; group_is_public?: unknown; channel_is_public?: unknown }
          const kind = typeof row.kind === 'string' ? row.kind : ''
          const isPublic = kind === 'channel' ? row.channel_is_public === true : row.group_is_public === true
          setActiveConversationIsPublic(Boolean(isPublic))
        },
        () => {
          if (!active) return
          setActiveConversationIsPublic(null)
        },
      )
      .then(() => {
        if (!active) return
        setActiveConversationIsPublicLoading(false)
      }, () => {
        if (!active) return
        setActiveConversationIsPublicLoading(false)
      })
    return () => {
      active = false
    }
  }, [activeConversationId, threadHeadConversation?.kind, user?.id])

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
        const listRes = await listMessengerConversations()
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
        const listRes = await listMessengerConversations()
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
  const filteredSortedItems = useMemo(() => {
    const filteredByKind =
      conversationKindFilter === 'all' ? sortedItems : sortedItems.filter((i) => i.kind === conversationKindFilter)
    if (!chatListSearchNorm) return filteredByKind
    return filteredByKind.filter((item) => itemMatchesMessengerListSearch(item, chatListSearchNorm))
  }, [sortedItems, chatListSearchNorm, conversationKindFilter])

  /** Сумма непрочитанных во всех диалогах, кроме активного — для бейджа «Назад к чатам». */
  const totalOtherUnread = useMemo(
    () =>
      mergedItems
        .filter((i) => i.id !== activeConversationId && !i.joinRequestPending)
        .reduce((sum, i) => sum + i.unreadCount, 0),
    [mergedItems, activeConversationId],
  )

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
      const built = buildForwardMetaFromDirectMessage(m, {
        currentUserId: user?.id,
        profileAvatar: profile?.avatar_url ?? null,
        sourceConversationId: activeConversationId,
        directConv: {
          otherUserId: conv.otherUserId ?? null,
          avatarUrl: conv.avatarUrl ?? null,
        },
      })
      setForwardDmComment('')
      setForwardDmModal(built)
      closeMessageActionMenu()
    },
    [activeConversationId, closeMessageActionMenu, profile?.avatar_url, threadHeadConversation, user?.id],
  )

  const handleForwardFromChannelMessage = useCallback(
    (message: DirectMessage) => {
      if (!threadHeadConversation || threadHeadConversation.kind !== 'channel') return
      const title = threadHeadConversation.title?.trim() || 'Канал'
      const avatar = conversationAvatarUrlById[activeConversationId] ?? null
      const built = buildForwardMetaFromChannelOrGroup(message, 'channel', {
        sourceTitle: title,
        sourceAvatarUrl: avatar,
        sourceConversationId: activeConversationId,
      })
      setForwardDmComment('')
      setForwardDmModal(built)
    },
    [activeConversationId, conversationAvatarUrlById, threadHeadConversation],
  )

  const handleForwardFromGroupMessage = useCallback(
    (message: DirectMessage) => {
      if (!threadHeadConversation || threadHeadConversation.kind !== 'group') return
      const title = threadHeadConversation.title?.trim() || 'Группа'
      const avatar = conversationAvatarUrlById[activeConversationId] ?? null
      const built = buildForwardMetaFromChannelOrGroup(message, 'group', {
        sourceTitle: title,
        sourceAvatarUrl: avatar,
        sourceConversationId: activeConversationId,
      })
      setForwardDmComment('')
      setForwardDmModal(built)
    },
    [activeConversationId, conversationAvatarUrlById, threadHeadConversation],
  )

  const finishForwardToDm = useCallback(
    async (targetConvId: string) => {
      if (!forwardDmModal || forwardDmSending) return
      const tid = targetConvId.trim()
      if (!tid) return
      const comment = forwardDmComment.trim()
      const base = forwardDmModal.sendBody.trim() || '…'
      const body = comment ? `${comment}\n\n${base}` : base
      setForwardDmSending(true)
      try {
        const res = await appendDirectMessage(tid, body, {
          meta: { forward: forwardDmModal.forward as unknown as Record<string, unknown> },
        })
        if (res.error) {
          toast.push({ tone: 'error', message: res.error, ms: 3200 })
          return
        }
        requestMessengerUnreadRefresh()
        toast.push({ tone: 'success', message: 'Сообщение переслано.', ms: 2200 })
        setForwardDmModal(null)
        setForwardDmComment('')
        navigate(buildMessengerUrl(tid))
      } finally {
        setForwardDmSending(false)
      }
    },
    [appendDirectMessage, forwardDmComment, forwardDmModal, forwardDmSending, navigate, toast],
  )

  const deleteMessageFromMenu = useCallback(async () => {
    const convId = activeConversationId.trim()
    const m = messageMenu?.message
    if (!user?.id || !convId || !m?.id || m.id.startsWith('local-')) return
    if (m.senderUserId !== user.id) return
    if (m.kind !== 'text' && m.kind !== 'image') return
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
  }, [messageMenu, user?.id, senderContactByUserId, closeMessageActionMenu])

  useEffect(() => {
    if (!messageMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMessageActionMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messageMenu, closeMessageActionMenu])

  useLayoutEffect(() => {
    const el = msgMenuWrapRef.current
    if (!el || !messageMenu) return
    const place = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) {
        requestAnimationFrame(place)
        return
      }
      const pad = 10
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left =
        messageMenu.mode === 'kebab'
          ? messageMenu.anchorX - rect.width
          : messageMenu.anchorX
      let top =
        messageMenu.mode === 'kebab'
          ? messageMenu.anchorY - rect.height - 6
          : messageMenu.anchorY
      if (left + rect.width > vw - pad) left = vw - pad - rect.width
      if (left < pad) left = pad
      if (top + rect.height > vh - pad) top = vh - pad - rect.height
      if (top < pad) top = pad
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.visibility = 'visible'
    }
    el.style.visibility = 'hidden'
    place()
  }, [messageMenu])

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
    setMessengerImageLightboxUrl(null)
    refocusMessengerComposer()
  }, [refocusMessengerComposer])

  useEffect(() => {
    if (!messengerImageLightboxUrl) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMessengerImageLightbox()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messengerImageLightboxUrl, closeMessengerImageLightbox])

  /** Android/WebView: надёжное закрытие свайпом (pointer + touch). */
  useLayoutEffect(() => {
    if (!messengerImageLightboxUrl) return
    const el = messengerLightboxFrameRef.current
    if (!el) return
    const start = { x: 0, y: 0, tracking: false }
    const closeIfSwipe = (dx: number, dy: number) => {
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const thr = LIGHTBOX_SWIPE_CLOSE_PX
      if (ax < thr && ay < thr) return
      if (ay >= ax && ay >= thr) {
        closeMessengerImageLightbox()
        return
      }
      if (ax > ay && ax >= thr) {
        closeMessengerImageLightbox()
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      start.tracking = true
      start.x = e.touches[0].clientX
      start.y = e.touches[0].clientY
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!start.tracking || e.changedTouches.length !== 1) return
      start.tracking = false
      const t = e.changedTouches[0]
      closeIfSwipe(t.clientX - start.x, t.clientY - start.y)
    }
    const onTouchCancel = () => {
      start.tracking = false
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [messengerImageLightboxUrl, closeMessengerImageLightbox])

  const adjustMobileComposerHeight = useCallback(() => {
    const ta = composerTextareaRef.current
    if (!ta || !isMobileMessenger) return
    const vv = window.visualViewport
    const vh = vv?.height ?? window.innerHeight
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, Math.round(vh * 0.28))}px`
  }, [isMobileMessenger])

  useLayoutEffect(() => {
    if (!isMobileMessenger) {
      const ta = composerTextareaRef.current
      if (ta) ta.style.height = ''
      return
    }
    adjustMobileComposerHeight()
  }, [
    draft,
    activeConversationId,
    editingMessageId,
    isMobileMessenger,
    adjustMobileComposerHeight,
    threadLoading,
  ])

  const closeMessengerMenu = useCallback(() => {
    setMessengerMenuOpen(false)
  }, [])

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

  useEffect(() => {
    const j = pendingJump
    if (!j) return
    const activeId = activeConversationId.trim()
    if (!activeId || j.conversationId.trim() !== activeId) return
    if (threadHeadConversation?.kind !== 'direct') return

    if (messages.some((m) => m.id === j.messageId)) {
      pendingJumpOlderAttemptsRef.current = 0
      scrollToQuotedMessage(j.messageId)
      setPendingJump(null)
      return
    }

    if (threadLoading || loadingOlder) return
    if (!hasMoreOlder) {
      pendingJumpOlderAttemptsRef.current = 0
      setPendingJump(null)
      return
    }
    if (pendingJumpOlderAttemptsRef.current > 12) {
      pendingJumpOlderAttemptsRef.current = 0
      setPendingJump(null)
      return
    }
    pendingJumpOlderAttemptsRef.current += 1
    void loadOlderMessages()
  }, [
    activeConversationId,
    hasMoreOlder,
    loadOlderMessages,
    loadingOlder,
    messages,
    pendingJump,
    scrollToQuotedMessage,
    threadHeadConversation?.kind,
    threadLoading,
  ])

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

  const goCreateRoomFromMenu = useCallback(() => {
    closeMessengerMenu()
    goCreateRoomFromMessenger()
  }, [closeMessengerMenu, goCreateRoomFromMessenger])

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

      const listRes = await listMessengerConversations()
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
    },
    [activeConversation, user?.id],
  )

  const closeConversationInfo = useCallback(() => {
    setConversationInfoOpen(false)
    setConversationInfoId(null)
    setConversationInfoEdit(false)
    setConversationInfoError(null)
    setConversationInfoLogoFile(null)
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
      const listRes = await listMessengerConversations()
      if (!listRes.error && listRes.data) setItems(listRes.data)
      setLeaveConfirmOpen(false)
      closeConversationInfo()
      navigate('/dashboard/messenger?view=list', { replace: true })
    } finally {
      setLeaveBusy(false)
    }
  }, [closeConversationInfo, conversationInfoConv, conversationInfoRole, leaveBusy, navigate, setItems])

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

  useEffect(() => {
    if (!conversationInfoEdit) {
      setConversationStaffRows([])
      setConversationStaffTargetUserId('')
      setConversationStaffNewRole('moderator')
      setConversationStaffLoading(false)
      return
    }
    const id = conversationInfoId?.trim()
    if (
      !id ||
      !user?.id ||
      !conversationInfoConv ||
      (conversationInfoConv.kind !== 'group' && conversationInfoConv.kind !== 'channel')
    ) {
      return
    }
    if (!conversationInfoRole || !['owner', 'admin'].includes(conversationInfoRole)) {
      return
    }
    let cancelled = false
    setConversationStaffLoading(true)
    void listConversationStaffMembers(id).then((r) => {
      if (cancelled) return
      setConversationStaffLoading(false)
      if (r.error) {
        setConversationStaffRows([])
        return
      }
      setConversationStaffRows(r.data ?? [])
      setConversationStaffTargetUserId('')
      setConversationStaffNewRole('moderator')
    })
    return () => {
      cancelled = true
    }
  }, [
    conversationInfoEdit,
    conversationInfoId,
    conversationInfoConv?.id,
    conversationInfoConv?.kind,
    conversationInfoRole,
    user?.id,
  ])

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
    const ok = await copyTextToClipboard(url)
    if (ok) toast.push({ tone: 'success', message: 'Ссылка скопирована.', ms: 2200 })
    else toast.push({ tone: 'info', message: url, ms: 4200 })
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

      const listRes = await listMessengerConversations()
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

  useEffect(() => {
    if (!messengerMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMessengerMenu()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messengerMenuOpen, closeMessengerMenu])

  useEffect(() => {
    if (!messengerSettingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMessengerSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [messengerSettingsOpen])

  useEffect(() => {
    if (!createModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCreateConversationModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createModalOpen, closeCreateConversationModal])

  const renderThreadComposer = () => (
    <div className="dashboard-messenger__composer" role="region" aria-label="Новое сообщение">
      {replyTo && !editingMessageId ? (
        <div className="dashboard-messenger__composer-reply">
          <div className="dashboard-messenger__composer-reply-text">
            <span className="dashboard-messenger__composer-reply-label">Ответ</span>{' '}
            <strong>{replyTo.senderNameSnapshot}</strong>
            <span className="dashboard-messenger__composer-reply-snippet">
              {replyTo.kind === 'image' ? (
                <>
                  {replyTo.meta?.image?.thumbPath?.trim() || replyTo.meta?.image?.path?.trim() ? (
                    <MessengerReplyMiniThumb
                      thumbPath={(
                        replyTo.meta?.image?.thumbPath?.trim() ||
                        replyTo.meta?.image?.path?.trim() ||
                        ''
                      ).trim()}
                      onThumbLayout={bumpScrollIfPinned}
                    />
                  ) : null}
                  <span>{truncateMessengerReplySnippet(replyTo.body)}</span>
                </>
              ) : (
                <span>{truncateMessengerReplySnippet(replyTo.body) || '…'}</span>
              )}
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
      {editingMessageId ? (
        <div className="dashboard-messenger__composer-edit-bar">
          <span>Редактирование сообщения</span>
          <button
            type="button"
            className="dashboard-messenger__composer-edit-cancel"
            onClick={() => {
              setEditingMessageId(null)
              setDraft('')
            }}
          >
            Отмена
          </button>
        </div>
      ) : null}
      <div className="dashboard-messenger__composer-main">
        <textarea
          ref={composerTextareaRef}
          className="dashboard-messenger__input"
          rows={isMobileMessenger ? 1 : 3}
          placeholder={editingMessageId ? 'Исправьте текст…' : 'Напиши сообщение…'}
          value={draft}
          disabled={threadLoading || photoUploading}
          onPaste={onComposerPaste}
          onChange={(e) => {
            setDraft(e.target.value)
            if (isMobileMessenger) queueMicrotask(() => adjustMobileComposerHeight())
          }}
          onPointerDown={() => unlockAudioContext()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void sendMessage()
            }
          }}
        />
        <div className="dashboard-messenger__composer-side">
          <div className="dashboard-messenger__composer-tools" ref={composerEmojiWrapRef}>
            {composerEmojiOpen && !editingMessageId ? (
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
              disabled={threadLoading || Boolean(editingMessageId)}
              onClick={() => setComposerEmojiOpen((v) => !v)}
            >
              😀
            </button>
            <button
              type="button"
              className="dashboard-messenger__composer-icon-btn"
              title="Фото"
              aria-label="Прикрепить фото"
              disabled={threadLoading || photoUploading || Boolean(editingMessageId)}
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
                if (f.size > MESSENGER_PHOTO_MAX_BYTES) {
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
            onClick={() => void sendMessage()}
          >
            {editingMessageId ? 'Сохранить' : 'Отправить'}
          </button>
        </div>
      </div>
      {photoUploading ? (
        <p className="dashboard-messenger__photo-status" role="status">
          Загрузка фото…
        </p>
      ) : null}
    </div>
  )

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
              className={`dashboard-messenger__list-head-btn${
                messengerMenuOpen ? ' dashboard-messenger__list-head-btn--open' : ''
              }`}
              onClick={() => setMessengerMenuOpen((v) => !v)}
              aria-label={messengerMenuOpen ? 'Закрыть меню' : 'Меню'}
              title="Меню"
              aria-expanded={messengerMenuOpen}
            >
              <MenuBurgerIcon />
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
          <div className="dashboard-messenger__layout">
            {showListPane ? (
              <aside className="dashboard-messenger__list" aria-label="Список диалогов">
                {isMobileMessenger ? (
                  <header className="dashboard-messenger__list-head dashboard-messenger__list-head--chats-toolbar">
                    <Link
                      to="/dashboard"
                      className="dashboard-messenger__list-head-back"
                      title="Назад в кабинет"
                      aria-label="Назад в кабинет"
                    >
                      <ChevronLeftIcon />
                    </Link>
                    <button
                      type="button"
                      className="dashboard-messenger__list-head-btn"
                      onClick={openCreateConversationModal}
                      aria-label="Создать группу или канал"
                      title="Создать группу или канал"
                    >
                      <PlusIcon />
                    </button>
                    <input
                      id="messenger-chat-list-search"
                      type="search"
                      enterKeyHint="search"
                      className="dashboard-messenger__list-head-search"
                      value={chatListSearch}
                      onChange={(e) => setChatListSearch(e.target.value)}
                      placeholder="Поиск по имени или сообщению…"
                      autoComplete="off"
                      aria-label="Поиск по чатам"
                    />
                    <div className="dashboard-messenger__list-head-actions">
                      <button
                        type="button"
                        className="dashboard-messenger__list-head-btn dashboard-messenger__list-head-btn--primary"
                        onClick={() => goCreateRoomFromMessenger()}
                        aria-label="Новая комната"
                        title="Новая комната"
                      >
                        <FiRrIcon name="circle-phone" />
                      </button>
                      <button
                        type="button"
                        className={`dashboard-messenger__list-head-btn${messengerMenuOpen ? ' dashboard-messenger__list-head-btn--open' : ''}`}
                        onClick={() => setMessengerMenuOpen((v) => !v)}
                        aria-label={messengerMenuOpen ? 'Закрыть меню' : 'Меню'}
                        title="Меню"
                        aria-expanded={messengerMenuOpen}
                      >
                        <MenuBurgerIcon />
                      </button>
                    </div>
                  </header>
                ) : null}
                {!isMobileMessenger ? (
                  <div className="dashboard-messenger__list-search">
                    <label className="dashboard-messenger__list-search-label" htmlFor="messenger-chat-list-search-desktop">
                      Поиск
                    </label>
                    <button
                      type="button"
                      className="dashboard-messenger__list-head-btn"
                      onClick={openCreateConversationModal}
                      aria-label="Создать группу или канал"
                      title="Создать группу или канал"
                    >
                      <PlusIcon />
                    </button>
                    <input
                      id="messenger-chat-list-search-desktop"
                      type="search"
                      enterKeyHint="search"
                      className="dashboard-messenger__list-search-input"
                      value={chatListSearch}
                      onChange={(e) => setChatListSearch(e.target.value)}
                      placeholder="Имя или последнее сообщение…"
                      autoComplete="off"
                      aria-label="Поиск по чатам"
                    />
                  </div>
                ) : null}
                <div
                  className={`dashboard-messenger__list-search${
                    isMobileMessenger ? ' dashboard-messenger__list-search--kind-tabs-only' : ''
                  }`}
                >
                  <div className="dashboard-messenger__kind-tabs" role="tablist" aria-label="Фильтр бесед">
                    {(
                      [
                        { id: 'all' as const, label: 'Все' },
                        { id: 'direct' as const, label: 'Лички' },
                        { id: 'group' as const, label: 'Группы' },
                        { id: 'channel' as const, label: 'Каналы' },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        className={`dashboard-messenger__kind-tab${
                          conversationKindFilter === id ? ' dashboard-messenger__kind-tab--active' : ''
                        }`}
                        aria-selected={conversationKindFilter === id}
                        onClick={() => setConversationKindFilter(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="dashboard-messenger__list-scroll">
                  {loading && sortedItems.length === 0 ? (
                    <div className="dashboard-messenger__pane-loader" aria-label="Загрузка списка…">
                      <BrandLogoLoader size={56} />
                    </div>
                  ) : sortedItems.length === 0 ? (
                    <div className="dashboard-chats-empty">Диалогов пока нет.</div>
                  ) : filteredSortedItems.length === 0 ? (
                    <div className="dashboard-chats-empty">Ничего не найдено.</div>
                  ) : (
                    filteredSortedItems.map((item) => {
                      const avatarUrl =
                        item.kind === 'direct'
                          ? item.avatarUrl ?? (!item.otherUserId ? profile?.avatar_url ?? null : null)
                          : conversationAvatarUrlById[item.id] ?? null
                      const rowPeekUserId =
                        item.kind === 'direct'
                          ? item.otherUserId?.trim() || (!item.otherUserId && user?.id ? user.id : '')
                          : ''
                      return (
                        <Link
                          key={item.id}
                          to={buildMessengerUrl(item.id)}
                          title={`${item.messageCount} сообщ.`}
                          onClick={(e) => {
                            e.preventDefault()
                            selectConversation(item.id)
                          }}
                          className={`dashboard-messenger__row${
                            item.id === activeConversationId ? ' dashboard-messenger__row--active' : ''
                          }`}
                        >
                          <div className="dashboard-messenger__row-main">
                            <button
                              type="button"
                              className="dashboard-messenger__row-avatar"
                              aria-hidden
                              tabIndex={-1}
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                if (item.kind === 'direct') {
                                  if (rowPeekUserId) {
                                    openUserPeek({
                                      userId: rowPeekUserId,
                                      displayName: item.title,
                                      avatarUrl,
                                    })
                                  }
                                } else {
                                  void openConversationInfo(item.id)
                                }
                              }}
                            >
                              {avatarUrl ? (
                                <img src={avatarUrl ?? undefined} alt="" />
                              ) : (
                                <span>{conversationInitial(item.title)}</span>
                              )}
                            </button>
                            <div className="dashboard-messenger__row-content">
                              <div className="dashboard-messenger__row-titleline">
                                <div className="dashboard-messenger__row-title">{item.title}</div>
                                <div className="dashboard-messenger__row-aside">
                                  <time
                                    className="dashboard-messenger__row-time"
                                    dateTime={item.lastMessageAt ?? item.createdAt}
                                  >
                                    {formatMessengerListRowTime(item.lastMessageAt ?? item.createdAt)}
                                  </time>
                                  {!item.joinRequestPending && item.unreadCount > 0 ? (
                                    <span className="dashboard-messenger__row-badge">
                                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                                    </span>
                                  ) : null}
                                </div>
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
                </div>
              </aside>
            ) : null}

            {showThreadPane ? (
              <div
                className={`dashboard-messenger__thread${isMobileMessenger ? ' dashboard-messenger__thread--mobile' : ''}`}
              >
                {loading && !threadHeadConversation ? (
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
                              <div className="messenger-join-gate__avatar" aria-hidden>
                                {invitePreview && conversationAvatarUrlById[invitePreview.id] ? (
                                  <img src={conversationAvatarUrlById[invitePreview.id] ?? undefined} alt="" />
                                ) : (
                                  <span>{conversationInitial(threadHeadConversation.title)}</span>
                                )}
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
                                <span className="dashboard-messenger__thread-head-center-avatar" aria-hidden>
                                  {conversationAvatarUrlById[activeConversationId] ? (
                                    <img src={conversationAvatarUrlById[activeConversationId] ?? undefined} alt="" />
                                  ) : (
                                    <span>{conversationInitial(threadHeadConversation.title)}</span>
                                  )}
                                </span>
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
                                {canRequestJoin && viewerOnly && pendingJoinRequest !== true ? (
                                  <button
                                    type="button"
                                    className="dashboard-messenger__list-head-btn dashboard-messenger__list-head-btn--primary dashboard-messenger__thread-head-join"
                                    onClick={() => void joinOpenConversation()}
                                    disabled={joinActionDisabled || inviteLoading}
                                    title={joinActionLabel}
                                  >
                                    {joinActionDisabled ? '…' : joinActionLabel}
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
                                className="dashboard-messenger__thread-head-back-btn"
                                aria-label="К списку чатов"
                                title="К списку чатов"
                                onClick={() => navigate('/dashboard/messenger?view=list', { replace: true })}
                              >
                                <ChevronLeftIcon />
                              </button>
                              <button
                                type="button"
                                className="dashboard-messenger__thread-head-center dashboard-messenger__thread-head-center--tappable"
                                aria-label="Информация о чате"
                                onClick={() => void openConversationInfo(activeConversationId)}
                              >
                                <span className="dashboard-messenger__thread-head-center-avatar" aria-hidden>
                                  {conversationAvatarUrlById[activeConversationId] ? (
                                    <img src={conversationAvatarUrlById[activeConversationId] ?? undefined} alt="" />
                                  ) : (
                                    <span>{conversationInitial(threadHeadConversation.title)}</span>
                                  )}
                                </span>
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
                                {canRequestJoin && viewerOnly && pendingJoinRequest !== true ? (
                                  <button
                                    type="button"
                                    className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__thread-head-join"
                                    onClick={() => void joinOpenConversation()}
                                    disabled={joinActionDisabled || inviteLoading}
                                    title={joinActionLabel}
                                  >
                                    {joinActionDisabled ? '…' : joinActionLabel}
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
                              <div className="messenger-join-gate__avatar" aria-hidden>
                                {conversationAvatarUrlById[activeConversationId] ? (
                                  <img src={conversationAvatarUrlById[activeConversationId] ?? undefined} alt="" />
                                ) : (
                                  <span>{conversationInitial(threadHeadConversation.title)}</span>
                                )}
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
                            isMemberHint={isMemberOfActiveConversation}
                            viewerOnly={viewerOnly}
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
                          />
                        ) : (
                          <ChannelThreadPane
                            conversationId={activeConversationId}
                            isMemberHint={isMemberOfActiveConversation}
                            postingMode={threadHeadConversation?.postingMode}
                            viewerOnly={viewerOnly}
                            joinRequestPending={pendingJoinRequest === true}
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
                          />
                        )}
                      </div>
                    )
                  ) : (
                  <DirectThreadPane>
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
                            <span className="dashboard-messenger__thread-head-center-avatar" aria-hidden>
                              {activeAvatarUrl ? (
                                <img src={activeAvatarUrl ?? undefined} alt="" />
                              ) : (
                                <span>{conversationInitial(threadHeadConversation.title)}</span>
                              )}
                            </span>
                            <div className="dashboard-messenger__thread-head-center-text">
                              <div className="dashboard-messenger__thread-head-center-title" role="heading" aria-level={3}>
                                {threadHeadConversation.title}
                              </div>
                              <div className="dashboard-messenger__thread-head-center-meta">
                                {formatMessengerListRowTime(
                                  threadHeadConversation.lastMessageAt ?? threadHeadConversation.createdAt,
                                )}
                                {isMemberOfActiveConversation &&
                                !threadHeadConversation.joinRequestPending &&
                                threadHeadConversation.unreadCount > 0 ? (
                                  <>
                                    {' · '}
                                    <span className="dashboard-messenger__row-badge dashboard-messenger__row-badge--inline">
                                      {threadHeadConversation.unreadCount > 99
                                        ? '99+'
                                        : threadHeadConversation.unreadCount}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </button>
                          <div className="dashboard-messenger__list-head-actions">
                            <button
                              type="button"
                              className="dashboard-messenger__list-head-btn dashboard-messenger__list-head-btn--primary"
                              onClick={() => goCreateRoomFromMessenger()}
                              aria-label="Новая комната"
                              title="Новая комната"
                            >
                              <FiRrIcon name="circle-phone" />
                            </button>
                            <button
                              type="button"
                              className={`dashboard-messenger__list-head-btn${messengerMenuOpen ? ' dashboard-messenger__list-head-btn--open' : ''}`}
                              onClick={() => setMessengerMenuOpen((v) => !v)}
                              aria-label={messengerMenuOpen ? 'Закрыть меню' : 'Меню'}
                              title="Меню"
                              aria-expanded={messengerMenuOpen}
                            >
                              <MenuBurgerIcon />
                            </button>
                          </div>
                        </header>
                      ) : (
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
                          <span className="dashboard-messenger__thread-avatar" aria-hidden>
                            {activeAvatarUrl ? (
                              <img src={activeAvatarUrl ?? undefined} alt="" />
                            ) : (
                              <span>{conversationInitial(threadHeadConversation.title)}</span>
                            )}
                          </span>
                          <div>
                            <div className="dashboard-messenger__thread-titleline">
                              <div className="dashboard-section__subtitle" role="heading" aria-level={3}>
                                {threadHeadConversation.title}
                              </div>
                              {isMemberOfActiveConversation &&
                              !threadHeadConversation.joinRequestPending &&
                              threadHeadConversation.unreadCount > 0 ? (
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
                        </button>
                      )}
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
                        <div ref={messagesContentRef} className="dashboard-messenger__messages">
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
                              const isOwn = Boolean(user?.id && message.senderUserId === user.id)
                              const reactions = reactionsByTargetId.get(message.id) ?? []
                              const rid =
                                message.quoteToMessageId?.trim() || message.replyToMessageId?.trim() || null
                              const { preview: replyPreview, scrollTargetId: replyScrollTargetId } = buildQuotePreview({
                                quotedMessageId: rid,
                                messageById: (id) => messages.find((m) => m.id === id),
                                resolveQuotedAvatarUrl: (senderUserId) =>
                                  resolveQuotedAvatarForDm(
                                    senderUserId,
                                    user?.id,
                                    profile?.avatar_url,
                                    threadHeadConversation?.kind === 'direct'
                                      ? (threadHeadConversation as unknown as DirectConversationSummary)
                                      : null,
                                  ),
                              })
                              return (
                                <ThreadMessageBubble
                                  key={message.id}
                                  message={message}
                                  isOwn={isOwn}
                                  dmMutePeerLabels={threadHeadConversation?.kind === 'direct'}
                                  reactions={reactions}
                                  formatDt={formatDateTime}
                                  replyPreview={replyPreview}
                                  replyScrollTargetId={replyScrollTargetId}
                                  onReplyQuoteNavigate={scrollToQuotedMessage}
                                  onForwardQuoteNavigate={navigateToForwardSource}
                                  bindMessageAnchor={bindMessageAnchor}
                                  menuOpen={messageMenu?.message.id === message.id}
                                  onOpenImageLightbox={(url) => {
                                    closeMessageActionMenu()
                                    setMessengerImageLightboxUrl(url)
                                  }}
                                  onInlineImageLayout={bumpScrollIfPinned}
                                  onReplyThumbLayout={bumpScrollIfPinned}
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
                                  currentUserId={user?.id ?? null}
                                  onReactionChipTap={(targetId, emoji) => {
                                    if (!isDirectReactionEmoji(emoji)) return
                                    void toggleMessengerReaction(targetId, emoji)
                                  }}
                                  quickReactEnabled={Boolean(
                                    user?.id &&
                                      (message.kind === 'text' || message.kind === 'image') &&
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
                                />
                              )
                            })
                          )}
                        </div>
                      </div>

                      {renderThreadComposer()}
                    </div>

                    {messageMenu
                      ? createPortal(
                          <div
                            ref={msgMenuWrapRef}
                            className="messenger-msg-menu-wrap"
                            style={{
                              position: 'fixed',
                              left: 0,
                              top: 0,
                              zIndex: 26500,
                              visibility: 'hidden',
                            }}
                          >
                            <MessengerMessageMenuPopover
                              canEdit={Boolean(
                                user?.id &&
                                  messageMenu.message.senderUserId === user.id &&
                                  !messageMenu.message.id.startsWith('local-') &&
                                  (messageMenu.message.kind === 'text' ||
                                    messageMenu.message.kind === 'image'),
                              )}
                              canDelete={Boolean(
                                user?.id &&
                                  messageMenu.message.senderUserId === user.id &&
                                  !messageMenu.message.id.startsWith('local-') &&
                                  (messageMenu.message.kind === 'text' ||
                                    messageMenu.message.kind === 'image'),
                              )}
                              onClose={closeMessageActionMenu}
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
                                (messageMenu.message.kind === 'text' || messageMenu.message.kind === 'image')
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
                          </div>,
                          document.body,
                        )
                      : null}
                  </DirectThreadPane>
                  )
                ) : (
                  <div className="dashboard-chats-empty">Выберите диалог слева.</div>
                )}
              </div>
            ) : null}
          </div>
        </>

        {messengerMenuOpen ? (
          <>
            <div
              className={`dashboard-messenger-quick-menu-backdrop${
                messengerMenuOpen ? ' dashboard-messenger-quick-menu-backdrop--open' : ''
              }`}
              aria-hidden={!messengerMenuOpen}
              onClick={closeMessengerMenu}
            />
            <nav
              className={`dashboard-messenger-quick-menu${
                messengerMenuOpen ? ' dashboard-messenger-quick-menu--open' : ''
              } dashboard-messenger-quick-menu--anchor-head`}
              aria-hidden={!messengerMenuOpen}
              aria-label="Навигация"
            >
              <div className="dashboard-messenger-quick-menu__grid" role="toolbar">
                <Link to="/" className="dashboard-messenger-quick-menu__btn" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <HomeIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Главная</span>
                </Link>
                <Link to="/dashboard" className="dashboard-messenger-quick-menu__btn" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <DashboardIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Кабинет</span>
                </Link>
                <Link to="/dashboard/chats" className="dashboard-messenger-quick-menu__btn" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <RoomsIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Комнаты</span>
                </Link>
                <Link to="/dashboard/contacts" className="dashboard-messenger-quick-menu__btn" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <ParticipantsBadgeIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Контакты</span>
                </Link>
                <button type="button" className="dashboard-messenger-quick-menu__btn" onClick={goCreateRoomFromMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <FiRrIcon name="circle-phone" />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Новая комната</span>
                </button>
                <button
                  type="button"
                  className="dashboard-messenger-quick-menu__btn"
                  onClick={() => {
                    closeMessengerMenu()
                    setMessengerSettingsOpen(true)
                  }}
                  title="Настройки мессенджера"
                  aria-label="Настройки мессенджера"
                >
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <FiRrIcon name="settings" />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Настройки</span>
                </button>
                {canAccessAdmin ? (
                  <Link to="/admin" className="dashboard-messenger-quick-menu__btn" onClick={closeMessengerMenu}>
                    <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                      <AdminPanelIcon />
                    </span>
                    <span className="dashboard-messenger-quick-menu__lbl">Админка</span>
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="dashboard-messenger-quick-menu__btn dashboard-messenger-quick-menu__btn--danger dashboard-messenger-quick-menu__btn--span"
                  onClick={() => {
                    closeMessengerMenu()
                    void signOut()
                  }}
                >
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <LogOutIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Выход</span>
                </button>
              </div>
            </nav>
          </>
        ) : null}
      </section>

      {forwardDmModal
        ? createPortal(
            <MessengerForwardToDmModal
              open
              onClose={() => {
                if (!forwardDmSending) {
                  setForwardDmModal(null)
                  setForwardDmComment('')
                }
              }}
              items={forwardDmPickItems}
              excludeConversationId={threadHeadConversation?.kind === 'direct' ? activeConversationId : null}
              comment={forwardDmComment}
              onCommentChange={setForwardDmComment}
              onSend={(id) => void finishForwardToDm(id)}
              sending={forwardDmSending}
            />,
            document.body,
          )
        : null}

      {joinRequestsOpen
        ? createPortal(
            <div
              className="confirm-dialog-root dashboard-messenger-join-requests-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="join-requests-title"
            >
              <button
                type="button"
                className="confirm-dialog-backdrop"
                aria-label="Закрыть"
                onClick={() => setJoinRequestsOpen(false)}
              />
              <div
                className="confirm-dialog dashboard-messenger-join-requests-dialog"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="dashboard-messenger-join-requests-dialog__header">
                  <h2 id="join-requests-title" className="dashboard-messenger-join-requests-dialog__title">
                    Запросы на вступление
                  </h2>
                  <button
                    type="button"
                    className="dashboard-messenger-join-requests-dialog__close"
                    aria-label="Закрыть"
                    onClick={() => setJoinRequestsOpen(false)}
                  >
                    <XCloseIcon />
                  </button>
                </div>
                <div className="dashboard-messenger-join-requests-dialog__body">
                  <div className="dashboard-messenger-join-requests-dialog__section">
                    <div className="dashboard-messenger-join-requests-dialog__section-title">Запросы</div>
                    {joinRequestsLoading ? (
                      <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" />
                    ) : conversationJoinRequests.length === 0 ? (
                      <p className="dashboard-messenger-join-requests-dialog__empty">Нет новых запросов на вступление.</p>
                    ) : (
                      <ul className="dashboard-messenger-join-requests-dialog__list">
                        {conversationJoinRequests.map((request) => (
                          <li key={request.requestId} className="dashboard-messenger-join-requests-dialog__item">
                            <div className="dashboard-messenger-join-requests-dialog__item-main">
                              <div className="dashboard-messenger-join-requests-dialog__name">{request.displayName}</div>
                              <div className="dashboard-messenger-join-requests-dialog__meta">
                                {new Date(request.createdAt).toLocaleString('ru-RU', {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </div>
                            </div>
                            <div className="dashboard-messenger-join-requests-dialog__item-actions">
                              <button
                                type="button"
                                className="dashboard-messenger-join-requests-dialog__approve"
                                disabled={joinRequestInFlight}
                                onClick={() => void approveJoinRequest(request.requestId)}
                              >
                                Одобрить
                              </button>
                              <button
                                type="button"
                                className="dashboard-messenger-join-requests-dialog__deny"
                                disabled={joinRequestInFlight}
                                onClick={() => void denyJoinRequest(request.requestId)}
                              >
                                Отклонить
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="dashboard-messenger-join-requests-dialog__section">
                    <div className="dashboard-messenger-join-requests-dialog__section-title">
                      Участники{conversationMembers.length > 0 ? ` (${conversationMembers.length})` : ''}
                    </div>
                    {membersLoading ? (
                      <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" />
                    ) : conversationMembers.length === 0 ? (
                      <p className="dashboard-messenger-join-requests-dialog__empty">Список участников пуст.</p>
                    ) : (
                      <ul className="dashboard-messenger-join-requests-dialog__list">
                        {conversationMembers.map((m) => (
                          <li key={m.userId} className="dashboard-messenger-join-requests-dialog__item">
                            <div className="dashboard-messenger-join-requests-dialog__item-main">
                              <div className="dashboard-messenger-join-requests-dialog__name">{m.displayName}</div>
                              <div className="dashboard-messenger-join-requests-dialog__meta">
                                {m.role === 'owner'
                                  ? 'Владелец'
                                  : m.role === 'admin'
                                  ? 'Администратор'
                                  : m.role === 'moderator'
                                  ? 'Модератор'
                                  : 'Участник'}
                              </div>
                            </div>
                            {memberKickAllowed(activeConversationRole, user?.id ?? null, m) ? (
                              <div className="dashboard-messenger-join-requests-dialog__item-actions">
                                <button
                                  type="button"
                                  className="dashboard-messenger-join-requests-dialog__kick"
                                  disabled={Boolean(kickMemberBusyId)}
                                  onClick={() => void kickConversationMember(m.userId)}
                                >
                                  {kickMemberBusyId === m.userId ? '…' : 'Исключить'}
                                </button>
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {messengerImageLightboxUrl
        ? createPortal(
            <div
              className="messenger-image-lightbox-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label="Просмотр изображения"
              onClick={() => closeMessengerImageLightbox()}
            >
              <button
                type="button"
                className="messenger-image-lightbox__close"
                aria-label="Закрыть"
                title="Закрыть"
                onClick={(e) => {
                  e.stopPropagation()
                  closeMessengerImageLightbox()
                }}
              >
                <XCloseIcon />
              </button>
              <div
                ref={messengerLightboxFrameRef}
                className="messenger-image-lightbox__frame"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  messengerLightboxSwipeRef.current = {
                    pointerId: e.pointerId,
                    x0: e.clientX,
                    y0: e.clientY,
                    active: true,
                  }
                }}
                onPointerUp={(e) => {
                  const s = messengerLightboxSwipeRef.current
                  if (!s.active || e.pointerId !== s.pointerId) return
                  s.active = false
                  const dx = e.clientX - s.x0
                  const dy = e.clientY - s.y0
                  const ax = Math.abs(dx)
                  const ay = Math.abs(dy)
                  const thr = LIGHTBOX_SWIPE_CLOSE_PX
                  if (ax < thr && ay < thr) return
                  if (ay >= ax && ay >= thr) {
                    closeMessengerImageLightbox()
                    return
                  }
                  if (ax > ay && ax >= thr) {
                    closeMessengerImageLightbox()
                  }
                }}
                onPointerCancel={() => {
                  messengerLightboxSwipeRef.current.active = false
                }}
              >
                <img src={messengerImageLightboxUrl} className="messenger-image-lightbox__img" alt="" draggable={false} />
              </div>
            </div>,
            document.body,
          )
        : null}

      {conversationInfoOpen && conversationInfoConv
        ? createPortal(
            <div
              className="messenger-settings-modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="messenger-conv-info-title"
            >
              <button
                type="button"
                className="messenger-settings-modal-backdrop"
                aria-label="Закрыть"
                onClick={closeConversationInfo}
              />
              <div className="messenger-settings-modal">
                <h2 id="messenger-conv-info-title" className="messenger-settings-modal__title">
                  {conversationInfoConv.kind === 'channel' ? 'Канал' : 'Группа'}
                </h2>

                {conversationInfoError ? <p className="join-error">{conversationInfoError}</p> : null}

                <div className="messenger-settings-modal__section">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="dashboard-messenger__thread-head-center-avatar"
                      aria-label="Логотип"
                    >
                      {conversationAvatarUrlById[conversationInfoConv.id] ? (
                        <img src={conversationAvatarUrlById[conversationInfoConv.id] ?? undefined} alt="" />
                      ) : (
                        <span>{conversationInitial(conversationInfoConv.title)}</span>
                      )}
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <strong>{conversationInfoConv.title}</strong>
                      <span className="messenger-settings-modal__hint">
                        {(conversationInfoConv.memberCount ?? 0)} участн.
                        {conversationInfoConv.publicNick?.trim() ? ` · @${conversationInfoConv.publicNick.trim()}` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="messenger-settings-modal__section">
                  <button
                    type="button"
                    className="messenger-settings-modal__row-btn"
                    onClick={() => void shareConversationInvite()}
                  >
                    <span className="messenger-settings-modal__row-ico" aria-hidden>
                      ⤴
                    </span>
                    Поделиться ссылкой
                  </button>
                </div>

                {conversationInfoRole &&
                (conversationInfoConv.kind === 'group'
                  ? ['owner', 'admin'].includes(conversationInfoRole)
                  : ['owner', 'admin', 'moderator'].includes(conversationInfoRole)) ? (
                  <div className="messenger-settings-modal__section">
                    <button
                      type="button"
                      className={`messenger-settings-modal__row-btn${
                        conversationInfoEdit ? ' messenger-settings-modal__row-btn--on' : ''
                      }`}
                      aria-pressed={conversationInfoEdit}
                      onClick={() => setConversationInfoEdit((v) => !v)}
                      disabled={conversationInfoLoading}
                    >
                      <span className="messenger-settings-modal__row-ico" aria-hidden>
                        ✎
                      </span>
                      Редактировать
                    </button>
                  </div>
                ) : null}

                {conversationInfoEdit ? (
                  <>
                    <div className="messenger-settings-modal__section">
                      <label className="messenger-settings-modal__label" htmlFor="messenger-conv-info-title-input">
                        Название
                      </label>
                      <input
                        id="messenger-conv-info-title-input"
                        className="dashboard-messenger__list-search-input"
                        value={conversationInfoTitle}
                        disabled={conversationInfoLoading}
                        onChange={(e) => setConversationInfoTitle(e.target.value)}
                        autoComplete="off"
                      />
                    </div>

                    <div className="messenger-settings-modal__section">
                      <label className="messenger-settings-modal__label" htmlFor="messenger-conv-info-nick-input">
                        Ник (для ссылки)
                      </label>
                      <input
                        id="messenger-conv-info-nick-input"
                        className="dashboard-messenger__list-search-input"
                        value={conversationInfoNick}
                        disabled={conversationInfoLoading}
                        onChange={(e) => setConversationInfoNick(e.target.value)}
                        autoComplete="off"
                      />
                      <p className="messenger-settings-modal__hint">Только a-z, 0-9, _ (3–32). Можно оставить пустым.</p>
                    </div>

                    {conversationInfoConv.kind === 'channel' ? (
                      <>
                        <div className="messenger-settings-modal__section">
                          <div className="messenger-settings-modal__push-row">
                            <span className="messenger-settings-modal__label">Доступ</span>
                            <PillToggle
                              compact
                              checked={conversationInfoIsOpen}
                              onCheckedChange={(next) => setConversationInfoIsOpen(next)}
                              offLabel="Закрыто"
                              onLabel="Открыто"
                              ariaLabel="Канал: открыт для всех или только по ссылке"
                              disabled={conversationInfoLoading}
                            />
                          </div>
                        </div>
                        <div className="messenger-settings-modal__section">
                          <div className="messenger-settings-modal__push-row">
                            <span className="messenger-settings-modal__label">Обсуждение</span>
                            <PillToggle
                              compact
                              checked={conversationInfoChannelComments === 'comments'}
                              onCheckedChange={(next) =>
                                setConversationInfoChannelComments(next ? 'comments' : 'reactions_only')
                              }
                              offLabel="Только реакции"
                              onLabel="Комментарии"
                              ariaLabel="Комментарии к постам канала"
                              disabled={conversationInfoLoading}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="messenger-settings-modal__section">
                        <span className="messenger-settings-modal__label">Доступ</span>
                        <div className="messenger-settings-modal__segment" role="group" aria-label="Доступ">
                          <button
                            type="button"
                            className={`messenger-settings-modal__segment-btn${
                              conversationInfoIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
                            }`}
                            onClick={() => setConversationInfoIsOpen(true)}
                            disabled={conversationInfoLoading}
                          >
                            Открыто
                          </button>
                          <button
                            type="button"
                            className={`messenger-settings-modal__segment-btn${
                              !conversationInfoIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
                            }`}
                            onClick={() => setConversationInfoIsOpen(false)}
                            disabled={conversationInfoLoading}
                          >
                            Закрыто
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="messenger-settings-modal__section">
                      <span className="messenger-settings-modal__label">Логотип</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={conversationInfoLoading}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          e.target.value = ''
                          setConversationInfoLogoFile(f)
                        }}
                      />
                      {conversationInfoLogoFile ? (
                        <p className="messenger-settings-modal__hint">Выбрано: {conversationInfoLogoFile.name}</p>
                      ) : (
                        <p className="messenger-settings-modal__hint">Опционально.</p>
                      )}
                    </div>

                    {conversationInfoRole && ['owner', 'admin'].includes(conversationInfoRole) ? (
                      <div className="messenger-settings-modal__section">
                        <span className="messenger-settings-modal__label">Роли и модерация</span>
                        <p className="messenger-settings-modal__hint">
                          Назначьте участнику роль модератора или администратора для работы с контентом
                          {conversationInfoConv.kind === 'channel'
                            ? ' канала (посты, комментарии, реакции).'
                            : ' группы (настройки по-прежнему только у владельца и админов).'}
                        </p>
                        {conversationStaffLoading ? (
                          <p className="messenger-settings-modal__hint">Загрузка списка…</p>
                        ) : conversationStaffRows.length === 0 ? (
                          <p className="messenger-settings-modal__hint">Нет других участников для назначения.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <select
                              className="dashboard-messenger__list-search-input"
                              value={conversationStaffTargetUserId}
                              onChange={(e) => setConversationStaffTargetUserId(e.target.value)}
                              disabled={conversationInfoLoading || conversationStaffMutating}
                              aria-label="Участник"
                            >
                              <option value="">— Выберите участника —</option>
                              {conversationStaffRows.map((r) => (
                                <option key={r.user_id} value={r.user_id}>
                                  {r.display_name}
                                  {r.member_role && r.member_role !== 'member'
                                    ? ` (${messengerStaffRoleShortLabel(r.member_role)})`
                                    : ''}
                                </option>
                              ))}
                            </select>
                            <select
                              className="dashboard-messenger__list-search-input"
                              value={conversationStaffNewRole}
                              onChange={(e) => setConversationStaffNewRole(e.target.value as ConversationStaffRole)}
                              disabled={conversationInfoLoading || conversationStaffMutating}
                              aria-label="Новая роль"
                            >
                              <option value="member">Участник</option>
                              <option value="moderator">Модератор</option>
                              <option value="admin" disabled={conversationInfoRole !== 'owner'}>
                                Администратор
                              </option>
                            </select>
                            <button
                              type="button"
                              className="dashboard-topbar__action dashboard-topbar__action--primary"
                              disabled={
                                conversationInfoLoading ||
                                conversationStaffMutating ||
                                !conversationStaffTargetUserId.trim()
                              }
                              onClick={() => void applyConversationStaffRole()}
                            >
                              {conversationStaffMutating ? '…' : 'Назначить или изменить роль'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {conversationInfoRole ? (
                  <div className="messenger-settings-modal__section">
                    {leaveError ? <p className="join-error">{leaveError}</p> : null}
                    <button
                      type="button"
                      className="dashboard-messenger-quick-menu__btn dashboard-messenger-quick-menu__btn--danger dashboard-messenger-quick-menu__btn--span"
                      onClick={() => setLeaveConfirmOpen(true)}
                      disabled={conversationInfoLoading || leaveBusy}
                    >
                      <span className="dashboard-messenger-quick-menu__lbl">
                        {conversationInfoConv.kind === 'channel' ? 'Выйти из канала' : 'Выйти из группы'}
                      </span>
                    </button>
                  </div>
                ) : null}

                <div
                  className={`messenger-settings-modal__actions${
                    conversationInfoEdit ? ' messenger-settings-modal__actions--split' : ''
                  }`}
                >
                  {conversationInfoEdit ? (
                    <>
                      <button
                        type="button"
                        className="dashboard-topbar__action"
                        onClick={cancelConversationInfoEdit}
                        disabled={conversationInfoLoading}
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        className="messenger-settings-modal__done"
                        onClick={() => void saveConversationInfo()}
                        disabled={conversationInfoLoading}
                      >
                        {conversationInfoLoading ? 'Сохраняем…' : 'Сохранить'}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="messenger-settings-modal__done" onClick={closeConversationInfo}>
                      Готово
                    </button>
                  )}
                </div>

                {leaveConfirmOpen ? (
                  <div className="confirm-dialog-root">
                    <button
                      type="button"
                      className="confirm-dialog-backdrop"
                      aria-label="Закрыть"
                      onClick={() => {
                        if (!leaveBusy) setLeaveConfirmOpen(false)
                      }}
                    />
                    <div className="confirm-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                      <h3 style={{ marginTop: 0 }}>
                        {conversationInfoConv.kind === 'channel' ? 'Выйти из канала?' : 'Выйти из группы?'}
                      </h3>
                      <p className="messenger-settings-modal__hint" style={{ marginTop: 6 }}>
                        Вы больше не будете участником и чат исчезнет из списка.
                      </p>
                      <div className="messenger-settings-modal__actions messenger-settings-modal__actions--split">
                        <button
                          type="button"
                          className="dashboard-topbar__action"
                          disabled={leaveBusy}
                          onClick={() => setLeaveConfirmOpen(false)}
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          className="dashboard-topbar__action dashboard-topbar__action--primary"
                          disabled={leaveBusy}
                          onClick={() => void confirmLeaveConversation()}
                        >
                          {leaveBusy ? '…' : 'Выйти'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {createModalOpen
        ? createPortal(
            <div
              className="messenger-settings-modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="messenger-create-title"
            >
              <button
                type="button"
                className="messenger-settings-modal-backdrop"
                aria-label="Закрыть"
                onClick={closeCreateConversationModal}
              />
              <div className="messenger-settings-modal">
                <h2 id="messenger-create-title" className="messenger-settings-modal__title">
                  Создать
                </h2>

                {createError ? <p className="join-error">{createError}</p> : null}

                <div className="messenger-settings-modal__section">
                  <span className="messenger-settings-modal__label">Тип</span>
                  <div className="messenger-settings-modal__segment" role="group" aria-label="Тип">
                    <button
                      type="button"
                      className={`messenger-settings-modal__segment-btn${
                        createKind === 'group' ? ' messenger-settings-modal__segment-btn--active' : ''
                      }`}
                      onClick={() => setCreateKind('group')}
                      disabled={createBusy}
                    >
                      Группа
                    </button>
                    <button
                      type="button"
                      className={`messenger-settings-modal__segment-btn${
                        createKind === 'channel' ? ' messenger-settings-modal__segment-btn--active' : ''
                      }`}
                      onClick={() => setCreateKind('channel')}
                      disabled={createBusy}
                    >
                      Канал
                    </button>
                  </div>
                </div>

                <div className="messenger-settings-modal__section">
                  <span className="messenger-settings-modal__label">Доступ</span>
                  <div className="messenger-settings-modal__segment" role="group" aria-label="Доступ">
                    <button
                      type="button"
                      className={`messenger-settings-modal__segment-btn${
                        createIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
                      }`}
                      onClick={() => setCreateIsOpen(true)}
                      disabled={createBusy}
                    >
                      Открыто
                    </button>
                    <button
                      type="button"
                      className={`messenger-settings-modal__segment-btn${
                        !createIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
                      }`}
                      onClick={() => setCreateIsOpen(false)}
                      disabled={createBusy}
                    >
                      Закрыто
                    </button>
                  </div>
                </div>

                <div className="messenger-settings-modal__section">
                  <label className="messenger-settings-modal__label" htmlFor="messenger-create-title-input">
                    Название
                  </label>
                  <input
                    id="messenger-create-title-input"
                    className="dashboard-messenger__list-search-input"
                    value={createTitle}
                    disabled={createBusy}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder={createKind === 'channel' ? 'Например: Новости' : 'Например: Команда'}
                    autoComplete="off"
                  />
                </div>

                <div className="messenger-settings-modal__section">
                  <label className="messenger-settings-modal__label" htmlFor="messenger-create-nick-input">
                    Ник (для ссылки)
                  </label>
                  <input
                    id="messenger-create-nick-input"
                    className="dashboard-messenger__list-search-input"
                    value={createNick}
                    disabled={createBusy}
                    onChange={(e) => setCreateNick(e.target.value)}
                    placeholder="team_chat"
                    autoComplete="off"
                    inputMode="text"
                  />
                  <p className="messenger-settings-modal__hint">Только a-z, 0-9, _ (3–32). Можно оставить пустым.</p>
                </div>

                <div className="messenger-settings-modal__section">
                  <span className="messenger-settings-modal__label">Логотип</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={createBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      e.target.value = ''
                      setCreateLogoFile(f)
                    }}
                  />
                  {createLogoFile ? (
                    <p className="messenger-settings-modal__hint">Выбрано: {createLogoFile.name}</p>
                  ) : (
                    <p className="messenger-settings-modal__hint">Опционально.</p>
                  )}
                </div>

                {createKind === 'channel' ? (
                  <div className="messenger-settings-modal__section">
                    <span className="messenger-settings-modal__label">Обсуждение</span>
                    <div className="messenger-settings-modal__segment" role="group" aria-label="Обсуждение">
                      <button
                        type="button"
                        className={`messenger-settings-modal__segment-btn${
                          createChannelComments === 'comments' ? ' messenger-settings-modal__segment-btn--active' : ''
                        }`}
                        onClick={() => setCreateChannelComments('comments')}
                        disabled={createBusy}
                      >
                        Комментарии
                      </button>
                      <button
                        type="button"
                        className={`messenger-settings-modal__segment-btn${
                          createChannelComments === 'reactions_only' ? ' messenger-settings-modal__segment-btn--active' : ''
                        }`}
                        onClick={() => setCreateChannelComments('reactions_only')}
                        disabled={createBusy}
                      >
                        Только реакции
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="messenger-settings-modal__actions">
                  <button
                    type="button"
                    className="messenger-settings-modal__done"
                    onClick={submitCreateConversation}
                    disabled={createBusy}
                  >
                    {createBusy ? 'Создаём…' : 'Создать'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {messengerSettingsOpen
        ? createPortal(
            <div
              className="messenger-settings-modal-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby="messenger-settings-title"
            >
              <button
                type="button"
                className="messenger-settings-modal-backdrop"
                aria-label="Закрыть"
                onClick={() => setMessengerSettingsOpen(false)}
              />
              <div className="messenger-settings-modal">
                <h2 id="messenger-settings-title" className="messenger-settings-modal__title">
                  Настройки мессенджера
                </h2>
                <div className="messenger-settings-modal__section">
                  <span className="messenger-settings-modal__label">Размер шрифта в чате</span>
                  <div className="messenger-settings-modal__segment" role="group" aria-label="Размер шрифта">
                    {(
                      [
                        { id: 's' as const, label: 'Мелкий' },
                        { id: 'm' as const, label: 'Обычный' },
                        { id: 'l' as const, label: 'Крупный' },
                      ] as const
                    ).map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        className={`messenger-settings-modal__segment-btn${
                          messengerFontPreset === id ? ' messenger-settings-modal__segment-btn--active' : ''
                        }`}
                        onClick={() => {
                          setMessengerFontPreset(id)
                          setMessengerFontPresetState(id)
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="messenger-settings-modal__section">
                  <span className="messenger-settings-modal__label">Звук входящих</span>
                  <button
                    type="button"
                    className={`messenger-settings-modal__row-btn${
                      soundEnabled ? ' messenger-settings-modal__row-btn--on' : ''
                    }`}
                    onClick={() => {
                      const next = !soundEnabled
                      setSoundEnabled(next)
                      setMessengerSoundEnabled(next)
                    }}
                    aria-pressed={soundEnabled}
                  >
                    <span className="messenger-settings-modal__row-ico" aria-hidden>
                      {soundEnabled ? <BellIcon /> : <BellOffIcon />}
                    </span>
                    {soundEnabled ? 'Включён — нажмите, чтобы выключить' : 'Выключен — нажмите, чтобы включить'}
                  </button>
                </div>
                {pushUi !== 'absent' ? (
                  <div className="messenger-settings-modal__section">
                    <div className="messenger-settings-modal__push-row">
                      <span className="messenger-settings-modal__label">Push-уведомления</span>
                      <PillToggle
                        compact
                        checked={pushUi === 'on'}
                        onCheckedChange={() => void toggleMessengerPush()}
                        offLabel="Выкл"
                        onLabel="Вкл"
                        ariaLabel="Push-уведомления о личных сообщениях"
                        disabled={pushBusy || pushUi === 'unconfigured' || pushUi === 'denied'}
                      />
                    </div>
                    {pushUi === 'unconfigured' ? (
                      <p className="messenger-settings-modal__hint">
                        Нет ключа в сборке — пересоберите с VITE_VAPID_PUBLIC_KEY
                      </p>
                    ) : null}
                    {pushUi === 'denied' ? (
                      <p className="messenger-settings-modal__hint">
                        Разрешите уведомления в настройках браузера.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="messenger-settings-modal__actions">
                  <button
                    type="button"
                    className="messenger-settings-modal__done"
                    onClick={() => setMessengerSettingsOpen(false)}
                  >
                    Готово
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

    </DashboardShell>
  )
}
