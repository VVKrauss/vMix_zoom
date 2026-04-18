import type { Dispatch, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
import { BrandLogoLoader } from '../BrandLogoLoader'
import {
  ChevronLeftIcon,
  FiRrIcon,
  MenuBurgerIcon,
  MessengerFilterAllIcon,
  MessengerFilterChannelIcon,
  MessengerFilterDirectIcon,
  MessengerFilterGroupIcon,
  PlusIcon,
} from '../icons'
import {
  buildMessengerUrl,
  conversationInitial,
  formatMessengerListRowTime,
} from '../../lib/messengerDashboardUtils'
import type {
  MessengerConversationKind,
  MessengerConversationSummary,
  OpenPublicConversationSearchHit,
} from '../../lib/messengerConversations'
import type { RegisteredUserSearchHit } from '../../lib/socialGraph'

type KindFilter = 'all' | MessengerConversationKind

export function MessengerChatListAside(props: {
  isMobileMessenger: boolean
  chatListSearch: string
  onChatListSearchChange: (value: string) => void
  openCreateConversationModal: () => void
  goCreateRoomFromMessenger: () => void
  messengerMenuOpen: boolean
  setMessengerMenuOpen: (v: boolean | ((p: boolean) => boolean)) => void
  conversationKindFilter: KindFilter
  /** Смена фильтра + сброс бейджа push по вкладке */
  onKindFilterChange: (id: KindFilter) => void
  /** Есть ли фоновый push по типу беседы (точка на вкладке) */
  pushFilterHint?: { direct: boolean; group: boolean; channel: boolean }
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
  selectConversation: (id: string) => void
  navigate: NavigateFunction
  openUserPeek: (p: { userId: string; displayName: string; avatarUrl: string | null }) => void
  openConversationInfo: (id: string) => void | Promise<void>
  pinnedChatIds: string[]
  setChatListRowMenu: Dispatch<
    SetStateAction<{
      item: MessengerConversationSummary
      anchor: { left: number; top: number; right: number; bottom: number }
    } | null>
  >
}) {
  const {
    isMobileMessenger,
    chatListSearch,
    onChatListSearchChange,
    openCreateConversationModal,
    goCreateRoomFromMessenger,
    messengerMenuOpen,
    setMessengerMenuOpen,
    conversationKindFilter,
    onKindFilterChange,
    pushFilterHint,
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
    selectConversation,
    navigate,
    openUserPeek,
    openConversationInfo,
    pinnedChatIds,
    setChatListRowMenu,
  } = props

  return (
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
            const hint =
              id !== 'all' && pushFilterHint && (id === 'direct' || id === 'group' || id === 'channel')
                ? pushFilterHint[id]
                : false
            return (
            <button
              key={id}
              type="button"
              role="tab"
              title={label}
              className={`dashboard-messenger__kind-tab${
                conversationKindFilter === id ? ' dashboard-messenger__kind-tab--active' : ''
              }${hint ? ' dashboard-messenger__kind-tab--push-hint' : ''}`}
              aria-selected={conversationKindFilter === id}
              onClick={() => onKindFilterChange(id)}
            >
              <span className="dashboard-messenger__kind-tab-inner">
                <span className="dashboard-messenger__kind-tab-icon" aria-hidden>
                  <Icon />
                </span>
                <span className="dashboard-messenger__kind-tab-label">{label}</span>
                <span className="dashboard-messenger__kind-tab-label-short">{shortLabel}</span>
              </span>
            </button>
            )
          })}
        </div>
      </div>
      <div className="dashboard-messenger__list-scroll">
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
                            <time className="dashboard-messenger__row-time" dateTime={item.lastMessageAt ?? item.createdAt}>
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
                      <button
                        type="button"
                        className="dashboard-messenger__row-avatar"
                        aria-hidden
                        tabIndex={-1}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          openUserPeek({
                            userId: hit.id,
                            displayName: hit.displayName,
                            avatarUrl: hit.avatarUrl ?? null,
                          })
                        }}
                      >
                        {hit.avatarUrl ? (
                          <img src={hit.avatarUrl} alt="" />
                        ) : (
                          <span>{conversationInitial(hit.displayName)}</span>
                        )}
                      </button>
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
                      <button
                        type="button"
                        className="dashboard-messenger__row-avatar"
                        aria-hidden
                        tabIndex={-1}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          selectConversation(hit.id)
                        }}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" />
                        ) : (
                          <span>{conversationInitial(hit.title)}</span>
                        )}
                      </button>
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
    </aside>
  )
}
