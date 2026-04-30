import { memo, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
import { BrandLogoLoader } from '../BrandLogoLoader'
import {
  ChevronLeftIcon,
  FiRrIcon,
  MessengerFilterAllIcon,
  MessengerFilterChannelIcon,
  MessengerFilterDirectIcon,
  MessengerFilterGroupIcon,
  PlusIcon,
  VoiceRecordComposerIcon,
} from '../icons'
import {
  buildMessengerUrl,
  conversationInitial,
  formatMessengerListRowTime,
  isMessengerClosedGroupOrChannel,
} from '../../lib/messengerDashboardUtils'
import { shouldShowVoiceMessageListIcon, voiceMessageListPreviewLabel } from '../../lib/messenger'
import type {
  MessengerConversationKind,
  MessengerConversationSummary,
  OpenPublicConversationSearchHit,
} from '../../lib/messengerConversations'
import type { RegisteredUserSearchHit } from '../../lib/socialGraph'
import { MessengerClosedGcLockBadge } from './MessengerClosedGcLockBadge'
import { StorageOrHttpAvatarImg } from './StorageOrHttpAvatarImg'

type KindFilter = 'all' | MessengerConversationKind

function MessengerChatListAsideImpl(props: {
  isMobileMessenger: boolean
  chatListSearch: string
  onChatListSearchChange: (value: string) => void
  openCreateConversationModal: () => void
  goCreateRoomFromMessenger: () => void
  onOpenMessengerSettings: () => void
  conversationKindFilter: KindFilter
  onConversationKindFilterChange: (id: KindFilter) => void
  /** Сумма непрочитанных по типу (как в строках списка), для бейджей на вкладках */
  filterUnreadByKind: { all: number; direct: number; group: number; channel: number }
  loading: boolean
  sortedItems: MessengerConversationSummary[]
  messengerListHasRows: boolean
  chatListGlobalLoading: boolean
  filteredSortedItems: MessengerConversationSummary[]
  extraGlobalUsers: RegisteredUserSearchHit[]
  extraGlobalOpen: OpenPublicConversationSearchHit[]
  profileAvatarUrl: string | null | undefined
  userId: string | undefined
  conversationAvatarUrlById: Record<string, string | null>
  activeConversationId: string
  mentionUnreadByConversationId?: Record<string, number>
  selectConversation: (id: string) => void
  navigate: NavigateFunction
  /** user_id собеседника в ЛС → в сети (для кольца у аватарки) */
  directPeersOnline: Record<string, boolean>
  /** user_id → в звонке (бледно-жёлтое кольцо, только если уже онлайн) */
  directPeersInRoom: Record<string, boolean>
  pinnedChatIds: string[]
  setChatListRowMenu: Dispatch<
    SetStateAction<{
      item: MessengerConversationSummary
      anchor: { left: number; top: number; right: number; bottom: number }
    } | null>
  >
  /** Мобильный список: потянуть вниз от верха — обновить дерево чатов */
  onRefreshChatList?: () => void | Promise<void>
  chatListRefreshing?: boolean
}) {
  const {
    isMobileMessenger,
    chatListSearch,
    onChatListSearchChange,
    openCreateConversationModal,
    goCreateRoomFromMessenger,
    onOpenMessengerSettings,
    conversationKindFilter,
    onConversationKindFilterChange,
    filterUnreadByKind,
    loading,
    sortedItems,
    messengerListHasRows,
    chatListGlobalLoading,
    filteredSortedItems,
    extraGlobalUsers,
    extraGlobalOpen,
    profileAvatarUrl,
    userId,
    conversationAvatarUrlById,
    activeConversationId,
    mentionUnreadByConversationId,
    selectConversation,
    navigate,
    directPeersOnline,
    directPeersInRoom,
    pinnedChatIds,
    setChatListRowMenu,
    onRefreshChatList,
    chatListRefreshing = false,
  } = props

  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const ptrInnerRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const ptrStartY = useRef(0)
  const ptrPullPx = useRef(0)
  useEffect(() => {
    const scrollEl = listScrollRef.current
    const inner = ptrInnerRef.current
    const onRefresh = onRefreshChatList
    if (!isMobileMessenger || !onRefresh || !scrollEl || !inner) return

    const THRESHOLD = 52

    const onStart = (e: TouchEvent) => {
      ptrStartY.current = e.touches[0].clientY
      ptrPullPx.current = 0
      inner.style.transition = ''
    }
    const onMove = (e: TouchEvent) => {
      if (chatListRefreshing) return
      if (scrollEl.scrollTop > 0) {
        inner.style.transform = ''
        ptrPullPx.current = 0
        return
      }
      const dy = e.touches[0].clientY - ptrStartY.current
      if (dy > 0) {
        const p = Math.min(dy * 0.45, 72)
        ptrPullPx.current = p
        inner.style.transform = `translateY(${p}px)`
        if (dy > 8) e.preventDefault()
      }
    }
    const onEnd = () => {
      const pulled = ptrPullPx.current
      ptrPullPx.current = 0
      const shouldRefresh = pulled >= THRESHOLD && !chatListRefreshing
      inner.style.transition = 'transform 0.32s cubic-bezier(0.33, 1, 0.68, 1)'
      inner.style.transform = 'translateY(0px)'
      const clearTr = () => {
        inner.style.transition = ''
        inner.removeEventListener('transitionend', clearTr)
      }
      inner.addEventListener('transitionend', clearTr, { once: true })
      if (shouldRefresh) void Promise.resolve(onRefresh())
    }

    scrollEl.addEventListener('touchstart', onStart, { passive: true })
    scrollEl.addEventListener('touchmove', onMove, { passive: false })
    scrollEl.addEventListener('touchend', onEnd, { passive: true })
    scrollEl.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      scrollEl.removeEventListener('touchstart', onStart)
      scrollEl.removeEventListener('touchmove', onMove)
      scrollEl.removeEventListener('touchend', onEnd)
      scrollEl.removeEventListener('touchcancel', onEnd)
    }
  }, [isMobileMessenger, onRefreshChatList, chatListRefreshing])

  // IMPORTANT: do not auto-focus search on mobile when the chat list opens.
  // Some mobile/tablet browsers may reserve keyboard space without showing it,
  // resulting in a large empty overlay panel.
  useEffect(() => {
    if (!isMobileMessenger) return
    const el = searchRef.current
    if (!el) return
    // If browser restored focus, actively drop it.
    if (document.activeElement === el) el.blur()
  }, [isMobileMessenger])

  return (
    <aside className="dashboard-messenger__list" aria-label="Список диалогов">
      <div className="dashboard-messenger__list-toolbar">
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
            ref={searchRef}
            value={chatListSearch}
            onChange={(e) => onChatListSearchChange(e.target.value)}
            placeholder="Имя, @ник, чат или сообщение…"
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
              className="dashboard-messenger__list-head-btn"
              onClick={() => onOpenMessengerSettings()}
              aria-label="Настройки мессенджера"
              title="Настройки мессенджера"
            >
              <FiRrIcon name="settings" />
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
            onChange={(e) => onChatListSearchChange(e.target.value)}
            placeholder="Имя, @ник, чат или последнее сообщение…"
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
              { id: 'all' as const, label: 'Все', shortLabel: 'Все', Icon: MessengerFilterAllIcon },
              { id: 'direct' as const, label: 'ЛС', shortLabel: 'ЛС', Icon: MessengerFilterDirectIcon },
              { id: 'group' as const, label: 'Группы', shortLabel: 'Гр', Icon: MessengerFilterGroupIcon },
              { id: 'channel' as const, label: 'Каналы', shortLabel: 'Кан', Icon: MessengerFilterChannelIcon },
            ] as const
          ).map(({ id, label, shortLabel, Icon }) => {
            const unread =
              id === 'all'
                ? filterUnreadByKind.all
                : id === 'direct' || id === 'group' || id === 'channel'
                  ? filterUnreadByKind[id]
                  : 0
            const badgeText = unread > 99 ? '99+' : unread > 0 ? String(unread) : ''
            return (
              <button
              key={id}
              type="button"
              role="tab"
              title={label}
              className={`dashboard-messenger__kind-tab${
                conversationKindFilter === id ? ' dashboard-messenger__kind-tab--active' : ''
              }`}
              aria-selected={conversationKindFilter === id}
              aria-label={badgeText ? `${label}, непрочитано: ${unread}` : label}
              onClick={() => onConversationKindFilterChange(id)}
            >
              <span className="dashboard-messenger__kind-tab-inner">
                <span className="dashboard-messenger__kind-tab-icon" aria-hidden>
                  <Icon />
                </span>
                <span className="dashboard-messenger__kind-tab-label">{label}</span>
                <span className="dashboard-messenger__kind-tab-label-short">{shortLabel}</span>
                {badgeText ? (
                  <span className="dashboard-messenger__kind-tab__badge" aria-hidden>
                    {badgeText}
                  </span>
                ) : null}
              </span>
              </button>
            )
          })}
          </div>
        </div>
      </div>
      <div ref={listScrollRef} className="dashboard-messenger__list-scroll">
        <div ref={ptrInnerRef} className="dashboard-messenger__list-scroll-inner">
          {isMobileMessenger && onRefreshChatList && chatListRefreshing ? (
            <div className="dashboard-messenger__list-ptr-banner" role="status" aria-live="polite">
              <BrandLogoLoader size={32} />
              <span>Обновление…</span>
            </div>
          ) : null}
          {loading && sortedItems.length === 0 ? (
          <div className="dashboard-messenger__pane-loader" aria-label="Загрузка списка…">
            <BrandLogoLoader size={56} />
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="dashboard-chats-empty">Диалогов пока нет.</div>
        ) : !messengerListHasRows && chatListGlobalLoading ? (
          <div className="dashboard-chats-empty">Поиск в каталоге…</div>
        ) : !messengerListHasRows ? (
          <div className="dashboard-chats-empty">Ничего не найдено.</div>
        ) : (
          <>
            {filteredSortedItems.map((item) => {
              const avatarUrl =
                item.kind === 'direct'
                  ? item.avatarUrl ?? (!item.otherUserId ? profileAvatarUrl ?? null : null)
                  : conversationAvatarUrlById[item.id] ?? null
              const rowPeekUserId =
                item.kind === 'direct'
                  ? item.otherUserId?.trim() || (!item.otherUserId && userId ? userId : '')
                  : ''
              const peerOnline =
                item.kind === 'direct' && rowPeekUserId ? Boolean(directPeersOnline[rowPeekUserId]) : false
              const peerInRoom =
                item.kind === 'direct' && rowPeekUserId ? Boolean(directPeersInRoom[rowPeekUserId]) : false
              const gcLock = isMessengerClosedGroupOrChannel(item)
              return (
                <div className="dashboard-messenger__row-shell" key={item.id}>
                  <Link
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
                      <div
                        className={`dashboard-messenger__row-avatar-wrap${
                          peerOnline
                            ? peerInRoom
                              ? ' dashboard-messenger__row-avatar-wrap--in-room'
                              : ' dashboard-messenger__row-avatar-wrap--online'
                            : ''
                        }`}
                        aria-hidden
                      >
                        {item.kind === 'direct' ? (
                          <div className="dashboard-messenger__row-avatar">
                            {avatarUrl ? (
                              <StorageOrHttpAvatarImg
                                src={avatarUrl}
                                alt=""
                                fallback={<span>{conversationInitial(item.title)}</span>}
                              />
                            ) : (
                              <span>{conversationInitial(item.title)}</span>
                            )}
                          </div>
                        ) : (
                          <div className="dashboard-messenger__gc-avatar-lock-wrap">
                            <div className="dashboard-messenger__row-avatar">
                              {avatarUrl ? (
                                <StorageOrHttpAvatarImg
                                  src={avatarUrl}
                                  alt=""
                                  fallback={<span>{conversationInitial(item.title)}</span>}
                                />
                              ) : (
                                <span>{conversationInitial(item.title)}</span>
                              )}
                            </div>
                            {gcLock ? <MessengerClosedGcLockBadge size="list" /> : null}
                          </div>
                        )}
                      </div>
                      <div className="dashboard-messenger__row-content">
                        <div className="dashboard-messenger__row-titleline">
                          <div className="dashboard-messenger__row-title">
                            {item.title}
                            {item.kind === 'group' ? (
                              <span className="dashboard-messenger__row-kind-icon" aria-label="Группа" title="Группа">
                                <MessengerFilterGroupIcon />
                              </span>
                            ) : item.kind === 'channel' ? (
                              <span className="dashboard-messenger__row-kind-icon" aria-label="Канал" title="Канал">
                                <MessengerFilterChannelIcon />
                              </span>
                            ) : null}
                          </div>
                          <div className="dashboard-messenger__row-aside">
                            <time className="dashboard-messenger__row-time" dateTime={item.lastMessageAt ?? item.createdAt}>
                              {formatMessengerListRowTime(item.lastMessageAt ?? item.createdAt)}
                            </time>
                            {(() => {
                              const n = mentionUnreadByConversationId?.[item.id] ?? 0
                              return n > 0 ? (
                                <span
                                  className="dashboard-messenger__row-badge dashboard-messenger__row-badge--mention"
                                  title="Упоминания"
                                  aria-label={`Упоминания: ${n}`}
                                >
                                  @{n > 99 ? '99+' : n}
                                </span>
                              ) : null
                            })()}
                            {!item.joinRequestPending && item.unreadCount > 0 ? (
                              <span className="dashboard-messenger__row-badge">
                                {item.unreadCount > 99 ? '99+' : item.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="dashboard-messenger__row-preview">
                          {(() => {
                            const raw = item.lastMessagePreview?.trim() ?? ''
                            if (!raw) return 'Пока без сообщений'
                            if (shouldShowVoiceMessageListIcon(raw)) {
                              return (
                                <span className="dashboard-messenger__row-preview--voice">
                                  <span className="dashboard-messenger__row-preview-voice-ic" aria-hidden>
                                    <VoiceRecordComposerIcon />
                                  </span>
                                  {voiceMessageListPreviewLabel(raw)}
                                </span>
                              )
                            }
                            return raw
                          })()}
                        </div>
                      </div>
                      <div className="dashboard-messenger__row-trailing">
                        <button
                          type="button"
                          className="dashboard-messenger__row-kebab"
                          aria-label="Действия с чатом"
                          title="Ещё"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const r = e.currentTarget.getBoundingClientRect()
                            setChatListRowMenu((cur) =>
                              cur?.item.id === item.id
                                ? null
                                : {
                                    item,
                                    anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
                                  },
                            )
                          }}
                        >
                          ⋮
                        </button>
                        {pinnedChatIds.includes(item.id) ? (
                          <span className="dashboard-messenger__row-pin" aria-label="Закреплён" title="Закреплён">
                            <FiRrIcon name="thumbtack" />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </div>
              )
            })}
            {extraGlobalUsers.map((hit) => {
              const subtitle = hit.profileSlug ? `@${hit.profileSlug}` : 'Профиль'
              const hitOnline = Boolean(directPeersOnline[hit.id])
              const hitInRoom = Boolean(directPeersInRoom[hit.id])
              return (
                <div className="dashboard-messenger__row-shell" key={`glob-user-${hit.id}`}>
                  <Link
                    to={buildMessengerUrl(undefined, hit.id, hit.displayName)}
                    title="Открыть диалог"
                    onClick={(e) => {
                      e.preventDefault()
                      navigate(buildMessengerUrl(undefined, hit.id, hit.displayName))
                    }}
                    className="dashboard-messenger__row"
                  >
                    <div className="dashboard-messenger__row-main">
                      <div
                        className={`dashboard-messenger__row-avatar-wrap${
                          hitOnline
                            ? hitInRoom
                              ? ' dashboard-messenger__row-avatar-wrap--in-room'
                              : ' dashboard-messenger__row-avatar-wrap--online'
                            : ''
                        }`}
                        aria-hidden
                      >
                        <div className="dashboard-messenger__row-avatar">
                          {hit.avatarUrl ? (
                            <StorageOrHttpAvatarImg
                              src={hit.avatarUrl}
                              alt=""
                              fallback={<span>{conversationInitial(hit.displayName)}</span>}
                            />
                          ) : (
                            <span>{conversationInitial(hit.displayName)}</span>
                          )}
                        </div>
                      </div>
                      <div className="dashboard-messenger__row-content">
                        <div className="dashboard-messenger__row-titleline">
                          <div className="dashboard-messenger__row-title">{hit.displayName}</div>
                          <div className="dashboard-messenger__row-aside">
                            <span className="dashboard-messenger__row-time">В каталоге</span>
                          </div>
                        </div>
                        <div className="dashboard-messenger__row-preview">{subtitle}</div>
                      </div>
                    </div>
                  </Link>
                </div>
              )
            })}
            {extraGlobalOpen.map((hit) => {
              const avatarUrl = conversationAvatarUrlById[hit.id] ?? null
              const kindLabel = hit.kind === 'channel' ? 'Канал' : 'Группа'
              const nickBit = hit.publicNick ? ` · @${hit.publicNick}` : ''
              return (
                <div className="dashboard-messenger__row-shell" key={`glob-open-${hit.id}`}>
                  <Link
                    to={buildMessengerUrl(hit.id)}
                    title={`${kindLabel}${nickBit}`}
                    onClick={(e) => {
                      e.preventDefault()
                      selectConversation(hit.id)
                    }}
                    className={`dashboard-messenger__row${
                      hit.id === activeConversationId ? ' dashboard-messenger__row--active' : ''
                    }`}
                  >
                    <div className="dashboard-messenger__row-main">
                      <div className="dashboard-messenger__row-avatar-wrap" aria-hidden>
                        <div className="dashboard-messenger__row-avatar">
                          {avatarUrl ? (
                            <StorageOrHttpAvatarImg
                              src={avatarUrl}
                              alt=""
                              fallback={<span>{conversationInitial(hit.title)}</span>}
                            />
                          ) : (
                            <span>{conversationInitial(hit.title)}</span>
                          )}
                        </div>
                      </div>
                      <div className="dashboard-messenger__row-content">
                        <div className="dashboard-messenger__row-titleline">
                          <div className="dashboard-messenger__row-title">{hit.title}</div>
                          <div className="dashboard-messenger__row-aside">
                            <span className="dashboard-messenger__row-time">Открытый</span>
                          </div>
                        </div>
                        <div className="dashboard-messenger__row-preview">
                          {kindLabel}
                          {nickBit}
                          {hit.memberCount ? ` · ${hit.memberCount} участн.` : ''}
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              )
            })}
          </>
        )}
        </div>
      </div>
    </aside>
  )
}

export const MessengerChatListAside = memo(MessengerChatListAsideImpl)
