import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useMessengerUnreadCount } from '../hooks/useMessengerUnreadCount'
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
} from '../lib/messengerWebPush'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useProfile } from '../hooks/useProfile'
import {
  appendDirectMessage,
  editDirectMessage,
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
  uploadMessengerImage,
} from '../lib/messenger'
import {
  getMessengerFontPreset,
  setMessengerFontPreset,
  truncateMessengerReplySnippet,
  type MessengerFontPreset,
} from '../lib/messengerUi'
import { MESSENGER_COMPOSER_EMOJIS } from '../lib/messengerComposerEmojis'
import { setPendingHostClaim, stashSpaceRoomCreateOptions } from '../lib/spaceRoom'
import { getContactStatuses, setUserFavorite, type ContactStatus } from '../lib/socialGraph'
import { supabase } from '../lib/supabase'
import { newRoomId } from '../utils/roomId'
import { BrandLogoLoader } from './BrandLogoLoader'
import {
  AdminPanelIcon,
  AttachmentIcon,
  BellIcon,
  BellOffIcon,
  FiRrIcon,
  ChatBubbleIcon,
  ChevronLeftIcon,
  DashboardIcon,
  HomeIcon,
  LogOutIcon,
  MenuBurgerIcon,
  ParticipantsBadgeIcon,
  XCloseIcon,
  RoomsIcon,
} from './icons'
import { DashboardShell } from './DashboardShell'
import { MessengerBubbleBody } from './MessengerBubbleBody'
import { MessengerReplyMiniThumb } from './MessengerReplyMiniThumb'
import { MessengerMessageMenuPopover } from './MessengerMessageMenuPopover'
import { PillToggle } from './PillToggle'
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
const MESSENGER_BOTTOM_PIN_PX = 160

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

function normalizeMessengerListSearch(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

function itemMatchesMessengerListSearch(item: DirectConversationSummary, needle: string): boolean {
  if (!needle) return true
  const title = item.title.toLowerCase()
  const preview = (item.lastMessagePreview ?? '').toLowerCase()
  return title.includes(needle) || preview.includes(needle)
}

/** Последнее text/system в треде — для превью в списке (реакции не считаются «последним сообщением»). */
function lastNonReactionBody(rows: DirectMessage[]): string | null {
  const sorted = [...rows].sort(sortDirectMessagesChrono)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const m = sorted[i]!
    if (m.kind === 'text' || m.kind === 'system') return m.body
    if (m.kind === 'image') return m.body.trim() || '📷 Фото'
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

type MessengerReplyPreview =
  | { snippet: string; kind: 'text'; quotedAvatarUrl: string | null; quotedName?: string }
  | { snippet: string; kind: 'image'; thumbPath?: string; quotedAvatarUrl: string | null; quotedName?: string }

function resolveQuotedAvatarForDm(
  quotedUserId: string | null | undefined,
  currentUserId: string | undefined,
  profileAvatar: string | null | undefined,
  conv: DirectConversationSummary | null,
): string | null {
  const qid = quotedUserId?.trim()
  if (!qid) return null
  if (currentUserId && qid === currentUserId) return profileAvatar?.trim() || null
  if (conv?.otherUserId?.trim() === qid) return conv.avatarUrl?.trim() || null
  if (currentUserId && qid !== currentUserId && conv?.avatarUrl?.trim()) return conv.avatarUrl.trim()
  return null
}

const SWIPE_REPLY_THRESHOLD_PX = 52
const SWIPE_REPLY_DECIDE_PX = 26
const SWIPE_REPLY_MAX_SHIFT_PX = 80
const LIGHTBOX_SWIPE_CLOSE_PX = 52

type MessengerDmBubbleProps = {
  message: DirectMessage
  isOwn: boolean
  reactions: DirectMessage[]
  formatDt: (iso: string) => string
  replyPreview: MessengerReplyPreview | null
  /** Если цитируемое сообщение есть в ленте — прокрутка к нему по клику. */
  replyScrollTargetId: string | null
  onReplyQuoteNavigate?: (messageId: string) => void
  bindMessageAnchor: (messageId: string, el: HTMLElement | null) => void
  currentUserId: string | null
  onReactionChipTap?: (targetMessageId: string, emoji: ReactionEmoji) => void
  /** Мобилка: свайп пузыря влево — ответить на сообщение. */
  swipeReplyEnabled?: boolean
  onSwipeReply?: (message: DirectMessage) => void
  menuOpen: boolean
  onMenuButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onBubbleContextMenu: (e: React.MouseEvent<HTMLElement>) => void
  onOpenImageLightbox: (imageUrl: string) => void
}

function MessengerDmBubble({
  message,
  isOwn,
  reactions,
  formatDt,
  replyPreview,
  replyScrollTargetId,
  onReplyQuoteNavigate,
  bindMessageAnchor,
  currentUserId,
  onReactionChipTap,
  swipeReplyEnabled,
  onSwipeReply,
  menuOpen,
  onMenuButtonClick,
  onBubbleContextMenu,
  onOpenImageLightbox,
}: MessengerDmBubbleProps) {
  const [swipeTx, setSwipeTx] = useState(0)
  const swipeRef = useRef<{
    pointerId: number | null
    x0: number
    y0: number
    active: boolean
    decided: boolean
    cancelled: boolean
    captured: boolean
  }>({
    pointerId: null,
    x0: 0,
    y0: 0,
    active: false,
    decided: false,
    cancelled: false,
    captured: false,
  })

  const reactionCounts = new Map<string, number>()
  for (const r of reactions) {
    const key = r.body.trim() || r.body
    reactionCounts.set(key, (reactionCounts.get(key) ?? 0) + 1)
  }

  const quoteNavigable = Boolean(replyScrollTargetId && onReplyQuoteNavigate)

  const canSwipeReply =
    Boolean(swipeReplyEnabled && onSwipeReply) &&
    (message.kind === 'text' || message.kind === 'image') &&
    !message.id.startsWith('local-')

  const endSwipeGesture = useCallback(
    (e: React.PointerEvent<HTMLElement>, el: HTMLElement) => {
      const s = swipeRef.current
      if (!s.active || e.pointerId !== s.pointerId) return
      const dx = e.clientX - s.x0
      const dy = e.clientY - s.y0
      s.active = false
      if (s.captured) {
        try {
          el.releasePointerCapture(e.pointerId)
        } catch {
          /* already released */
        }
      }
      swipeRef.current = {
        pointerId: null,
        x0: 0,
        y0: 0,
        active: false,
        decided: false,
        cancelled: false,
        captured: false,
      }
      setSwipeTx(0)
      const horizontalIntent =
        Math.abs(dx) > Math.abs(dy) &&
        dx <= -SWIPE_REPLY_THRESHOLD_PX &&
        Math.abs(dx) >= SWIPE_REPLY_THRESHOLD_PX
      if (!s.cancelled && horizontalIntent) {
        onSwipeReply?.(message)
      }
    },
    [message, onSwipeReply],
  )

  const replyQuoteInner =
    replyPreview ? (
      <span className="dashboard-messenger__reply-quote-inner">
        {replyPreview.quotedAvatarUrl ? (
          <img
            src={replyPreview.quotedAvatarUrl}
            alt=""
            className="dashboard-messenger__reply-quote-avatar"
            draggable={false}
          />
        ) : (
          <span className="dashboard-messenger__reply-quote-avatar dashboard-messenger__reply-quote-avatar--fallback" aria-hidden>
            {(replyPreview.quotedName ?? '?').trim().slice(0, 1).toUpperCase() || '?'}
          </span>
        )}
        {replyPreview.kind === 'image' && replyPreview.thumbPath ? (
          <MessengerReplyMiniThumb thumbPath={replyPreview.thumbPath} />
        ) : null}
        <span className="dashboard-messenger__reply-quote-snippet">{replyPreview.snippet}</span>
      </span>
    ) : null

  const replyQuoteAria =
    replyPreview?.quotedName?.trim()
      ? `К цитируемому сообщению: ${replyPreview.quotedName.trim()}`
      : 'К цитируемому сообщению'

  return (
    <article
      ref={(el) => {
        bindMessageAnchor(message.id, el)
      }}
      className={`dashboard-messenger__message${isOwn ? ' dashboard-messenger__message--own' : ''}${
        canSwipeReply ? ' dashboard-messenger__message--swipe-reply' : ''
      }`}
      style={
        swipeTx !== 0
          ? { transform: `translateX(${swipeTx}px)`, transition: 'none' }
          : { transform: undefined, transition: 'transform 0.18s ease-out' }
      }
      onPointerDown={(e) => {
        if (!canSwipeReply || e.button !== 0) return
        const t = e.target as HTMLElement
        if (
          t.closest(
            'button, a, .messenger-message-img-trigger, .dashboard-messenger__reaction-chip, .messenger-message-link',
          )
        ) {
          return
        }
        swipeRef.current = {
          pointerId: e.pointerId,
          x0: e.clientX,
          y0: e.clientY,
          active: true,
          decided: false,
          cancelled: false,
          captured: false,
        }
      }}
      onPointerMove={(e) => {
        const s = swipeRef.current
        if (!canSwipeReply || !s.active || e.pointerId !== s.pointerId) return
        const dx = e.clientX - s.x0
        const dy = e.clientY - s.y0
        if (!s.decided && (Math.abs(dx) > SWIPE_REPLY_DECIDE_PX || Math.abs(dy) > SWIPE_REPLY_DECIDE_PX)) {
          s.decided = true
          /* Вертикаль (скролл ленты) или без явного смещения влево — не ответ */
          if (Math.abs(dy) >= Math.abs(dx) || dx > -SWIPE_REPLY_DECIDE_PX) {
            s.cancelled = true
            setSwipeTx(0)
            return
          }
          s.captured = true
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }
        if (s.cancelled || !s.decided) return
        const tx = Math.max(-SWIPE_REPLY_MAX_SHIFT_PX, Math.min(0, dx))
        setSwipeTx(tx)
      }}
      onPointerUp={(e) => endSwipeGesture(e, e.currentTarget)}
      onPointerCancel={(e) => endSwipeGesture(e, e.currentTarget)}
      onContextMenu={onBubbleContextMenu}
    >
      <div className="dashboard-messenger__message-meta">
        <div className="dashboard-messenger__message-meta-main">
          <span className="dashboard-messenger__message-author">{message.senderNameSnapshot}</span>
          <time dateTime={message.createdAt}>{formatDt(message.createdAt)}</time>
          {message.editedAt ? <span className="dashboard-messenger__edited">изм.</span> : null}
        </div>
        <button
          type="button"
          className={`dashboard-messenger__msg-more${menuOpen ? ' dashboard-messenger__msg-more--open' : ''}`}
          aria-label="Действия с сообщением"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={onMenuButtonClick}
        >
          ⋮
        </button>
      </div>
      {replyPreview ? (
        quoteNavigable ? (
          <button
            type="button"
            className="dashboard-messenger__reply-quote dashboard-messenger__reply-quote--action"
            aria-label={replyQuoteAria}
            onClick={() => onReplyQuoteNavigate?.(replyScrollTargetId!)}
          >
            {replyQuoteInner}
          </button>
        ) : (
          <div className="dashboard-messenger__reply-quote" role="note">
            {replyQuoteInner}
          </div>
        )
      ) : null}
      <div className="dashboard-messenger__message-body">
        <MessengerBubbleBody message={message} onOpenImageLightbox={onOpenImageLightbox} />
      </div>
      {reactionCounts.size > 0 ? (
        <div
          className="dashboard-messenger__message-reactions"
          aria-label="Реакции"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {[...reactionCounts.entries()].map(([emoji, count]) => {
            const mine = Boolean(
              currentUserId &&
                reactions.some(
                  (r) => r.senderUserId === currentUserId && (r.body.trim() || r.body) === emoji,
                ),
            )
            return (
              <span
                key={emoji}
                className={`dashboard-messenger__reaction-chip${mine ? ' dashboard-messenger__reaction-chip--mine' : ''}`}
                role={mine ? 'button' : undefined}
                tabIndex={mine ? 0 : undefined}
                onClick={
                  mine
                    ? (e) => {
                        e.stopPropagation()
                        if (isDirectReactionEmoji(emoji)) onReactionChipTap?.(message.id, emoji)
                      }
                    : undefined
                }
                onKeyDown={
                  mine
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          if (isDirectReactionEmoji(emoji)) onReactionChipTap?.(message.id, emoji)
                        }
                      }
                    : undefined
                }
              >
                <span className="dashboard-messenger__reaction-emoji">{emoji}</span>
                {count > 1 ? <span className="dashboard-messenger__reaction-count">{count}</span> : null}
              </span>
            )
          })}
        </div>
      ) : null}
    </article>
  )
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
  const { openUserPeek } = useUserPeek()
  const { profile } = useProfile()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const isMobileMessenger = useMediaQuery('(max-width: 900px)')
  const headerMessengerUnread = useMessengerUnreadCount()
  const [soundEnabled, setSoundEnabled] = useState(() => isMessengerSoundEnabled())
  const [messengerFontPreset, setMessengerFontPresetState] = useState<MessengerFontPreset>(() =>
    getMessengerFontPreset(),
  )
  const [messengerSettingsOpen, setMessengerSettingsOpen] = useState(false)
  const [messengerMenuOpen, setMessengerMenuOpen] = useState(false)
  const [chatListSearch, setChatListSearch] = useState('')
  /** Мобильный режим «только дерево чатов» — не подставлять chat в URL и не грузить тред */
  const listOnlyMobile = isMobileMessenger && searchParams.get('view') === 'list'

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
  const [items, setItems] = useState<DirectConversationSummary[]>([])
  const [activeConversation, setActiveConversation] = useState<DirectConversationSummary | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
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
  const [favoriteBusyUserId, setFavoriteBusyUserId] = useState<string | null>(null)
  /** Снятие реакции уже отразили в списке диалогов после RPC — пропускаем дубль из realtime DELETE. */
  const reactionDeleteSidebarSyncedRef = useRef(new Set<string>())

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
  const messagesRef = useRef(messages)
  messagesRef.current = messages
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
  const prevThreadIdForClearRef = useRef<string | null>(null)
  const prevMessagesLenForScrollRef = useRef(0)
  /** Уже загруженные сообщения для этого id — не дергать API при повторном срабатывании эффекта (напр. loading). */
  const lastFetchedThreadIdRef = useRef<string | null>(null)
  /** После первой успешной загрузки списка — повторный bootstrap при «Назад к чатам» не нужен */
  const listLoadedOnceRef = useRef(false)

  const updateMessengerScrollPinned = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el) return
    messengerPinnedToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < MESSENGER_BOTTOM_PIN_PX
  }, [])

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
        setMessageMenu(null)
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
      const preview = msg.kind === 'image' ? (msg.body.trim() || '📷 Фото') : msg.body
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

          if (!skipSidebarBump) bumpSidebarForInsert(msg)
          /* Пока тред открыт: входящие от других не должны увеличивать непрочитанные (сервер + бейдж в шапке). */
          if (!isOwn) {
            void markDirectConversationRead(convId)
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
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeConversationId, listOnlyMobile, user?.id])

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

      setItems((prev) =>
        prev.map((item) =>
          item.id === cid
            ? {
                ...item,
                lastMessageAt: createdAt,
                lastMessagePreview: body,
                unreadCount: senderUserId !== uid ? item.unreadCount + 1 : item.unreadCount,
                messageCount: item.messageCount + 1,
              }
            : item,
        ),
      )

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
      setError('Файл больше 2 МБ. Выберите изображение меньшего размера.')
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
    const preview = caption || '📷 Фото'
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

  const sortedItems = useMemo(() => sortConversationsByActivity(items), [items])
  const chatListSearchNorm = useMemo(() => normalizeMessengerListSearch(chatListSearch), [chatListSearch])
  const filteredSortedItems = useMemo(() => {
    if (!chatListSearchNorm) return sortedItems
    return sortedItems.filter((item) => itemMatchesMessengerListSearch(item, chatListSearchNorm))
  }, [sortedItems, chatListSearchNorm])

  /** Сумма непрочитанных во всех диалогах, кроме активного — для бейджа «Назад к чатам». */
  const totalOtherUnread = useMemo(
    () =>
      items
        .filter((i) => i.id !== activeConversationId)
        .reduce((sum, i) => sum + i.unreadCount, 0),
    [items, activeConversationId],
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

  const closeMessageActionMenu = useCallback(() => setMessageMenu(null), [])

  const toggleFavoriteFromMessageMenu = useCallback(async () => {
    const m = messageMenu?.message
    const sid = m?.senderUserId?.trim()
    if (!sid || !user?.id || sid === user.id) return
    setFavoriteBusyUserId(sid)
    try {
      const cur = senderContactByUserId[sid]?.isFavorite ?? false
      const res = await setUserFavorite(sid, !cur)
      if (res.data) {
        setSenderContactByUserId((prev) => ({ ...prev, [sid]: res.data! }))
      }
    } finally {
      setFavoriteBusyUserId(null)
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

  /** Шапка треда: сразу из списка по URL, пока грузится полная карточка с сервера */
  const threadHeadConversation =
    sortedItems.find((i) => i.id === activeConversationId) ?? activeConversation

  const activeAvatarUrl =
    threadHeadConversation?.avatarUrl ??
    (threadHeadConversation?.otherUserId ? null : profile?.avatar_url ?? null)

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

  const goCreateRoomFromMessenger = useCallback(() => {
    const id = newRoomId()
    setPendingHostClaim(id)
    stashSpaceRoomCreateOptions(id, { lifecycle: 'permanent', chatVisibility: 'everyone' })
    const otherId = threadHeadConversation?.otherUserId?.trim()
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
      headerExtra={
        !isMobileMessenger ? (
          <div className="dashboard-topbar__messenger-controls">
            <Link
              to="/dashboard"
              className="dashboard-topbar__messenger-back"
              title="Назад в кабинет"
              aria-label="Назад в кабинет"
            >
              <ChevronLeftIcon />
            </Link>
            <button
              type="button"
              className="dashboard-topbar__messenger-settings"
              onClick={() => setMessengerSettingsOpen(true)}
              title="Настройки мессенджера"
              aria-label="Настройки мессенджера"
            >
              <FiRrIcon name="settings" className="dashboard-topbar__messenger-settings-fi" />
            </button>
            <button
              type="button"
              className={`dashboard-topbar__sound${soundEnabled ? ' dashboard-topbar__sound--on' : ''}`}
              onClick={() => {
                const next = !soundEnabled
                setSoundEnabled(next)
                setMessengerSoundEnabled(next)
              }}
              aria-pressed={soundEnabled}
              title={soundEnabled ? 'Выключить звук уведомлений' : 'Включить звук уведомлений'}
            >
              {soundEnabled ? <BellIcon /> : <BellOffIcon />}
            </button>
            {pushUi !== 'absent' ? (
              <span
                className="dashboard-topbar__push-toggle-wrap"
                title={
                  pushUi === 'unconfigured'
                    ? 'В сборке нет VITE_VAPID_PUBLIC_KEY — добавьте в Timeweb / .env и пересоберите'
                    : pushUi === 'on'
                      ? 'Отключить push-уведомления'
                      : pushUi === 'denied'
                        ? 'Браузер запретил уведомления'
                        : 'Включить push-уведомления'
                }
              >
                <PillToggle
                  compact
                  checked={pushUi === 'on'}
                  onCheckedChange={() => void toggleMessengerPush()}
                  ariaLabel="Push-уведомления о личных сообщениях"
                  disabled={pushBusy || pushUi === 'unconfigured' || pushUi === 'denied'}
                />
              </span>
            ) : null}
          </div>
        ) : null
      }
    >
      <section
        className={`dashboard-section dashboard-messenger dashboard-messenger--fill dashboard-messenger--font-${messengerFontPreset}${
          isMobileMessenger ? ' dashboard-messenger--mobile-chromeless' : ''
        }`}
      >
        {error ? <p className="join-error">{error}</p> : null}

        {!error ? (
          <>
          <div className="dashboard-messenger__layout">
            {showListPane ? (
              <aside className="dashboard-messenger__list" aria-label="Список диалогов">
                {isMobileMessenger ? (
                  <header className="dashboard-messenger__list-head">
                    <Link
                      to="/dashboard"
                      className="dashboard-messenger__list-head-back"
                      title="Назад в кабинет"
                      aria-label="Назад в кабинет"
                    >
                      <ChevronLeftIcon />
                    </Link>
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
                      const avatarUrl = item.avatarUrl ?? (!item.otherUserId ? profile?.avatar_url ?? null : null)
                      const rowPeekUserId = item.otherUserId?.trim() || (!item.otherUserId && user?.id ? user.id : '')
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
                                if (rowPeekUserId) {
                                  openUserPeek({
                                    userId: rowPeekUserId,
                                    displayName: item.title,
                                    avatarUrl,
                                  })
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
                                  {item.unreadCount > 0 ? (
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
                  <>
                    <div className="dashboard-messenger__thread-head">
                      {isMobileMessenger ? (
                        <header className="dashboard-messenger__list-head">
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
                          <div className="dashboard-messenger__thread-head-center">
                            <button
                              type="button"
                              className="dashboard-messenger__thread-head-center-avatar"
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
                              {activeAvatarUrl ? (
                                <img src={activeAvatarUrl ?? undefined} alt="" />
                              ) : (
                                <span>{conversationInitial(threadHeadConversation.title)}</span>
                              )}
                            </button>
                            <div className="dashboard-messenger__thread-head-center-text">
                              <h3 className="dashboard-messenger__thread-head-center-title">
                                {threadHeadConversation.title}
                              </h3>
                              <div className="dashboard-messenger__thread-head-center-meta">
                                {formatMessengerListRowTime(
                                  threadHeadConversation.lastMessageAt ?? threadHeadConversation.createdAt,
                                )}
                                {threadHeadConversation.unreadCount > 0 ? (
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
                          </div>
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
                        <div className="dashboard-messenger__thread-head-main">
                          <button
                            type="button"
                            className="dashboard-messenger__thread-avatar"
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
                            {activeAvatarUrl ? (
                              <img src={activeAvatarUrl ?? undefined} alt="" />
                            ) : (
                              <span>{conversationInitial(threadHeadConversation.title)}</span>
                            )}
                          </button>
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
                              const rid = message.replyToMessageId?.trim()
                              let replyPreview: MessengerReplyPreview | null = null
                              let replyScrollTargetId: string | null = null
                              if (rid) {
                                const src = messages.find((m) => m.id === rid)
                                if (src) {
                                  replyScrollTargetId = rid
                                  const quotedAvatarUrl = resolveQuotedAvatarForDm(
                                    src.senderUserId,
                                    user?.id,
                                    profile?.avatar_url,
                                    threadHeadConversation,
                                  )
                                  const quotedName = src.senderNameSnapshot?.trim() || undefined
                                  if (src.kind === 'image') {
                                    const thumbPath =
                                      src.meta?.image?.thumbPath?.trim() ||
                                      src.meta?.image?.path?.trim() ||
                                      ''
                                    replyPreview = {
                                      quotedAvatarUrl,
                                      quotedName,
                                      snippet: truncateMessengerReplySnippet(src.body),
                                      kind: 'image',
                                      ...(thumbPath ? { thumbPath } : {}),
                                    }
                                  } else {
                                    replyPreview = {
                                      quotedAvatarUrl,
                                      quotedName,
                                      snippet: truncateMessengerReplySnippet(src.body) || '…',
                                      kind: 'text',
                                    }
                                  }
                                } else {
                                  replyPreview = {
                                    quotedAvatarUrl: null,
                                    quotedName: undefined,
                                    snippet: 'Нет в загруженной истории',
                                    kind: 'text',
                                  }
                                }
                              }
                              return (
                                <MessengerDmBubble
                                  key={message.id}
                                  message={message}
                                  isOwn={isOwn}
                                  reactions={reactions}
                                  formatDt={formatDateTime}
                                  replyPreview={replyPreview}
                                  replyScrollTargetId={replyScrollTargetId}
                                  onReplyQuoteNavigate={scrollToQuotedMessage}
                                  bindMessageAnchor={bindMessageAnchor}
                                  menuOpen={messageMenu?.message.id === message.id}
                                  onOpenImageLightbox={(url) => {
                                    closeMessageActionMenu()
                                    setMessengerImageLightboxUrl(url)
                                  }}
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
                                    void toggleMessengerReaction(targetId, emoji)
                                  }}
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
                              onReply={() => {
                                setReplyTo(messageMenu.message)
                                closeMessageActionMenu()
                              }}
                              onPickReaction={(emoji) => {
                                if (!isDirectReactionEmoji(emoji)) return
                                void toggleMessengerReaction(messageMenu.message.id, emoji)
                                closeMessageActionMenu()
                              }}
                              showAddFavorite={Boolean(
                                messageMenu.message.senderUserId &&
                                  user?.id &&
                                  messageMenu.message.senderUserId !== user.id,
                              )}
                              favoriteActive={Boolean(
                                messageMenu.message.senderUserId &&
                                  senderContactByUserId[messageMenu.message.senderUserId]?.isFavorite,
                              )}
                              favoriteBusy={
                                Boolean(messageMenu.message.senderUserId) &&
                                favoriteBusyUserId === messageMenu.message.senderUserId
                              }
                              onToggleFavorite={() => {
                                void toggleFavoriteFromMessageMenu()
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
          </>
        ) : null}

        {isMobileMessenger ? (
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
                <Link to="/dashboard/friends" className="dashboard-messenger-quick-menu__btn" onClick={closeMessengerMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <ParticipantsBadgeIcon />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Друзья</span>
                </Link>
                <button type="button" className="dashboard-messenger-quick-menu__btn" onClick={goCreateRoomFromMenu}>
                  <span className="dashboard-messenger-quick-menu__ico" aria-hidden>
                    <FiRrIcon name="circle-phone" />
                  </span>
                  <span className="dashboard-messenger-quick-menu__lbl">Новая комната</span>
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
