import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import {
  type RoomChatConversationSummary,
  ROOM_CHAT_PAGE_SIZE,
  leaveRoomChatArchiveEntry,
  listRoomChatConversationsForUser,
} from '../lib/chatArchive'
import {
  fetchPersistentSpaceRoomsForUser,
  setPendingHostClaim,
  stashSpaceRoomCreateOptions,
  type PersistentSpaceRoomRow,
} from '../lib/spaceRoom'
import { newRoomId } from '../utils/roomId'
import type { DashboardRoomModalSubject } from '../lib/dashboardRoomStats'
import { ConfirmDialog } from './ConfirmDialog'
import { DashboardShell } from './DashboardShell'
import { DashboardRoomRow } from './DashboardRoomRow'
import { DashboardRoomStatsModal } from './DashboardRoomStatsModal'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from './icons'
import { RoomChatArchiveModal } from './RoomChatArchiveModal'

function formatRoomListDate(value: string | null): string {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DashboardChatsPage() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<RoomChatConversationSummary[]>([])
  const [pageOffset, setPageOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalConversationId, setModalConversationId] = useState<string | null>(null)
  const [modalSummary, setModalSummary] = useState<RoomChatConversationSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RoomChatConversationSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [myRooms, setMyRooms] = useState<PersistentSpaceRoomRow[]>([])
  const [myRoomsLoading, setMyRoomsLoading] = useState(false)
  const [myRoomsError, setMyRoomsError] = useState<string | null>(null)
  const [roomStatsSubject, setRoomStatsSubject] = useState<DashboardRoomModalSubject | null>(null)

  const loadPage = useCallback(
    async (offset: number) => {
      if (!user?.id) {
        setItems([])
        setHasMore(false)
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      const result = await listRoomChatConversationsForUser(user.id, {
        limit: ROOM_CHAT_PAGE_SIZE,
        offset,
      })
      if (result.error) {
        setError(result.error)
        setItems([])
        setHasMore(false)
      } else {
        const nextItems = result.data ?? []
        if (nextItems.length === 0 && offset > 0) {
          setLoading(false)
          void loadPage(Math.max(0, offset - ROOM_CHAT_PAGE_SIZE))
          return
        }
        setItems(nextItems)
        setHasMore(result.hasMore)
        setPageOffset(offset)
      }
      setLoading(false)
    },
    [user?.id],
  )

  useEffect(() => {
    void loadPage(0)
  }, [loadPage])

  useEffect(() => {
    let active = true
    const uid = user?.id?.trim()
    if (!uid) {
      setMyRooms([])
      setMyRoomsError(null)
      return
    }
    setMyRoomsLoading(true)
    setMyRoomsError(null)
    void (async () => {
      const res = await fetchPersistentSpaceRoomsForUser(uid)
      if (!active) return
      if (res.error) {
        setMyRooms([])
        setMyRoomsError(res.error)
      } else {
        setMyRooms(res.data ?? [])
      }
      setMyRoomsLoading(false)
    })()
    return () => {
      active = false
    }
  }, [user?.id])

  const createPersistentRoom = () => {
    if (!user?.id) return
    const id = newRoomId()
    setPendingHostClaim(id)
    stashSpaceRoomCreateOptions(id, { lifecycle: 'permanent', chatVisibility: 'everyone' })
    navigate(`/r/${encodeURIComponent(id)}`)
  }

  const goNewer = () => {
    if (pageOffset <= 0) return
    void loadPage(Math.max(0, pageOffset - ROOM_CHAT_PAGE_SIZE))
  }

  const goOlder = () => {
    if (!hasMore) return
    void loadPage(pageOffset + ROOM_CHAT_PAGE_SIZE)
  }

  const closeChatModal = () => {
    setModalOpen(false)
    setModalConversationId(null)
    setModalSummary(null)
  }

  const confirmRemoveFromList = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    const res = await leaveRoomChatArchiveEntry(deleteTarget.id)
    setDeleteBusy(false)
    if (!res.ok) {
      setError(res.error ?? 'Не удалось удалить запись.')
      setDeleteTarget(null)
      return
    }
    setDeleteTarget(null)
    if (modalConversationId === deleteTarget.id) closeChatModal()
    void loadPage(pageOffset)
  }

  const canGoNewer = pageOffset > 0

  const joinableSlugs = useMemo(() => {
    const s = new Set<string>()
    for (const r of myRooms) {
      if (r.status === 'open' && r.slug?.trim()) s.add(r.slug.trim())
    }
    return s
  }, [myRooms])

  const emptyHint = useMemo(
    () =>
      !loading && !error && items.length === 0
        ? 'Здесь появятся комнаты, в которых вы участвовали. Откройте эфир по ссылке — запись добавится автоматически.'
        : null,
    [loading, error, items.length],
  )

  return (
    <DashboardShell active="chats" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <section className="dashboard-section">
        <div className="dashboard-chat-page__head">
          <Link
            to="/dashboard"
            className="join-back-arrow"
            title="Назад в кабинет"
            aria-label="Назад в кабинет"
          >
            <ChevronLeftIcon />
          </Link>
          <h2 className="dashboard-settings-back__title dashboard-chat-page__page-title">Комнаты</h2>
        </div>

        <div className="dashboard-my-rooms">
          <div className="dashboard-my-rooms__head">
            <h3 className="dashboard-my-rooms__title">Мои комнаты</h3>
            <button
              type="button"
              className="dashboard-my-rooms__add"
              onClick={createPersistentRoom}
              disabled={!user?.id}
              title="Создать постоянную комнату"
              aria-label="Создать постоянную комнату"
            >
              <PlusIcon />
            </button>
          </div>
          {myRoomsLoading ? (
            <p className="dashboard-my-rooms__hint">Загрузка…</p>
          ) : myRoomsError ? (
            <p className="join-error dashboard-my-rooms__hint">{myRoomsError}</p>
          ) : myRooms.length === 0 ? (
            <p className="dashboard-my-rooms__hint">
              Постоянных комнат пока нет. Нажмите «+» — откроется эфир с новой ссылкой; после первого входа комната
              сохранится в списке.
            </p>
          ) : (
            <ul className="dashboard-my-rooms__list">
              {myRooms.map((r) => {
                const label = r.displayName?.trim() || r.slug
                const showTitle = Boolean(r.displayName?.trim())
                return (
                  <li key={r.slug}>
                    <DashboardRoomRow
                      dateLabel={formatRoomListDate(r.createdAt)}
                      title={label}
                      titleHint={showTitle ? r.slug : undefined}
                      avatarUrl={r.avatarUrl}
                      meta={`${r.accessMode} · ${r.chatVisibility}`}
                      isOpen={r.status === 'open'}
                      showCamLink={r.status === 'open'}
                      camHref={`/r/${encodeURIComponent(r.slug)}`}
                      onOpenStats={() =>
                        setRoomStatsSubject({ kind: 'persistent', slug: r.slug, preview: r })
                      }
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {!loading && !error && (items.length > 0 || pageOffset > 0) ? (
          <div className="dashboard-rooms-pager" role="navigation" aria-label="Страницы списка комнат">
            <button
              type="button"
              className="dashboard-rooms-pager__btn"
              disabled={!canGoNewer || loading}
              onClick={goNewer}
              aria-label="Более новые комнаты"
              title="Более новые комнаты"
            >
              <ChevronLeftIcon />
            </button>
            <span className="dashboard-rooms-pager__info">
              {pageOffset + 1}–{pageOffset + items.length}
              {hasMore ? ' …' : ''}
            </span>
            <button
              type="button"
              className="dashboard-rooms-pager__btn"
              disabled={!hasMore || loading}
              onClick={goOlder}
              aria-label={`Предыдущие ${ROOM_CHAT_PAGE_SIZE} комнат`}
              title={`Предыдущие ${ROOM_CHAT_PAGE_SIZE} комнат`}
            >
              <ChevronRightIcon />
            </button>
          </div>
        ) : null}

        {loading ? <div className="auth-loading" aria-label="Загрузка..." /> : null}
        {!loading && error ? <p className="join-error">{error}</p> : null}
        {!loading && !error && items.length === 0 && pageOffset === 0 ? (
          <div className="dashboard-chats-empty">{emptyHint}</div>
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <ul className="dashboard-rooms-compact-list">
            {items.map((item) => {
              const isOpen = !item.closedAt
              const slug = item.roomSlug?.trim() ?? ''
              const canJoinRoom = Boolean(slug && joinableSlugs.has(slug))
              return (
                <li key={item.id}>
                  <DashboardRoomRow
                    dateLabel={formatRoomListDate(item.lastMessageAt ?? item.createdAt)}
                    title={item.title}
                    titleHint={item.title}
                    meta={`${item.messageCount} сообщ.`}
                    isOpen={isOpen}
                    showCamLink={canJoinRoom}
                    camHref={canJoinRoom ? `/r/${encodeURIComponent(slug)}` : undefined}
                    onOpenStats={() => setRoomStatsSubject({ kind: 'archive', summary: item })}
                  />
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>

      {user?.id && modalConversationId ? (
        <RoomChatArchiveModal
          open={modalOpen}
          conversationId={modalConversationId}
          summary={modalSummary}
          userId={user.id}
          onClose={closeChatModal}
        />
      ) : null}

      {user?.id ? (
        <DashboardRoomStatsModal
          open={roomStatsSubject !== null}
          subject={roomStatsSubject}
          joinableSlugs={joinableSlugs}
          currentUserId={user.id}
          onClose={() => setRoomStatsSubject(null)}
          onOpenChat={(p) => {
            if (p.summary.messageCount <= 0) return
            setModalSummary(p.summary)
            setModalConversationId(p.conversationId)
            setModalOpen(true)
            setRoomStatsSubject(null)
          }}
          onRemoveFromList={
            roomStatsSubject?.kind === 'archive'
              ? () => {
                  setDeleteTarget(roomStatsSubject.summary)
                  setRoomStatsSubject(null)
                }
              : undefined
          }
          removeFromListBusy={deleteBusy}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Убрать комнату из списка?"
        message={
          <div className="dashboard-rooms-delete-confirm">
            <p>
              Запись о комнате «{deleteTarget?.title ?? '—'}» исчезнет только у вас. У других участников эфира доступ к
              чату сохранится.
            </p>
            <p>
              <strong>Важно:</strong> если в этом чате не было сообщений, диалог будет удалён из базы целиком — у всех
              пропадёт пустая запись. Если сообщения были, история останется у тех, кто не удалял запись.
            </p>
            <p className="dashboard-rooms-delete-confirm--warn">
              У вас локально переписка из этого списка больше не отобразится; восстановить только вашу «закладку» без
              повторного входа в эфир нельзя.
            </p>
          </div>
        }
        confirmLabel="Удалить из списка"
        cancelLabel="Отмена"
        confirmLoading={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null)
        }}
        onConfirm={() => void confirmRemoveFromList()}
      />
    </DashboardShell>
  )
}
