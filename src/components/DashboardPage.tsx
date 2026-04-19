import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useProfile } from '../hooks/useProfile'
import {
  type RoomChatConversationSummary,
  ROOM_CHAT_PAGE_SIZE,
  leaveRoomChatArchiveEntry,
  listRoomChatConversationsForUser,
} from '../lib/chatArchive'
import type { DashboardRoomModalSubject } from '../lib/dashboardRoomStats'
import { readHiddenIncomingPinIds } from '../lib/dashboardIncomingPinsHidden'
import { listMessengerPeersByMessageCount } from '../lib/messenger'
import type { ContactCard } from '../lib/socialGraph'
import { listMyContacts } from '../lib/socialGraph'
import { fetchPersistentSpaceRoomsForUser, type PersistentSpaceRoomRow } from '../lib/spaceRoom'
import { supabase } from '../lib/supabase'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'
import { DashboardContactsIncomingModal } from './DashboardContactsIncomingModal'
import { DashboardLayoutPicker } from './DashboardLayoutPicker'
import { PillToggle } from './PillToggle'
import { DashboardShell } from './DashboardShell'
import { ConfirmDialog } from './ConfirmDialog'
import { DashboardRoomRow } from './DashboardRoomRow'
import { DashboardRoomStatsModal } from './DashboardRoomStatsModal'
import { RoomChatArchiveModal } from './RoomChatArchiveModal'
import { ChatBubbleIcon, SettingsGearIcon } from './icons'

const STATUS_LABEL: Record<string, string> = {
  active: 'Активен',
  blocked: 'Заблокирован',
  pending: 'Ожидает подтверждения',
  deleted: 'Удалён',
}

const STATUS_CLASS: Record<string, string> = {
  active: 'dashboard-badge--active',
  blocked: 'dashboard-badge--blocked',
  pending: 'dashboard-badge--pending',
  deleted: 'dashboard-badge--deleted',
}

const GLOBAL_ROLE_LABEL: Record<string, string> = {
  superadmin: 'Суперадмин',
  platform_admin: 'Администратор платформы',
  support_admin: 'Поддержка',
  registered_user: 'Зарегистрированный пользователь',
}

function globalRoleBadgeClass(code: string): string {
  if (code === 'superadmin') {
    return 'dashboard-badge dashboard-badge--role dashboard-badge--role-super'
  }
  if (code === 'platform_admin' || code === 'support_admin') {
    return 'dashboard-badge dashboard-badge--role dashboard-badge--role-ops'
  }
  return 'dashboard-badge dashboard-badge--role'
}

function formatRoomTileDate(value: string | null): string {
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

/** Время последней активности в личке (для тайла «Контакты»). */
function formatPeerGuestTime(iso: string | null): string {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  const now = new Date()
  const sameDay =
    dt.getDate() === now.getDate() &&
    dt.getMonth() === now.getMonth() &&
    dt.getFullYear() === now.getFullYear()
  if (sameDay) {
    return `Сегодня, ${dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
  }
  return dt.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function DashboardPage() {
  const { signOut, user } = useAuth()
  const { openUserPeek } = useUserPeek()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const {
    profile,
    plan,
    loading,
    searchPrivacySaving,
    contactPrivacySaving,
    error,
    saveSearchPrivacy,
    saveContactPrivacy,
    openProfileEdit,
  } = useProfile()

  const privacyAutosaveSkipRef = useRef(true)
  const [roomLayout, setRoomLayout] = useState<StoredLayoutMode>('pip')
  const [roomShowLayoutToggle, setRoomShowLayoutToggle] = useState(true)
  const [roomHideVideoLetterboxing, setRoomHideVideoLetterboxing] = useState(true)
  const [roomSaveMsg, setRoomSaveMsg] = useState<string | null>(null)
  const [roomSaveErr, setRoomSaveErr] = useState<string | null>(null)
  const [roomSaving, setRoomSaving] = useState(false)
  const [searchClosed, setSearchClosed] = useState(true)
  const [allowSearchName, setAllowSearchName] = useState(true)
  const [allowSearchEmail, setAllowSearchEmail] = useState(false)
  const [allowSearchSlug, setAllowSearchSlug] = useState(true)
  const [searchPrivacyErr, setSearchPrivacyErr] = useState<string | null>(null)
  const [dmAllowFrom, setDmAllowFrom] = useState<'everyone' | 'contacts_only'>('everyone')
  const [profileViewAllowFrom, setProfileViewAllowFrom] = useState<'everyone' | 'contacts_only'>('everyone')
  const [profileShowAvatar, setProfileShowAvatar] = useState(true)
  const [profileShowSlug, setProfileShowSlug] = useState(true)
  /** true — не показывать время последней активности другим (инверсия profile_show_last_active). */
  const [hideActivity, setHideActivity] = useState(false)
  /** true — не показывать статус «в сети» другим (инверсия profile_show_online). */
  const [hideOnlineStatus, setHideOnlineStatus] = useState(false)
  const [profileDmReceiptsPrivate, setProfileDmReceiptsPrivate] = useState(false)
  const [contactPrivacyErr, setContactPrivacyErr] = useState<string | null>(null)
  const [myRooms, setMyRooms] = useState<PersistentSpaceRoomRow[]>([])
  const [myRoomsLoading, setMyRoomsLoading] = useState(false)
  const [roomArchiveItems, setRoomArchiveItems] = useState<RoomChatConversationSummary[]>([])
  const [roomArchiveLoading, setRoomArchiveLoading] = useState(false)
  const [contacts, setContacts] = useState<ContactCard[]>([])
  const [contactsTick, setContactsTick] = useState(0)
  const [peerTop, setPeerTop] = useState<
    { userId: string; messageCount: number; avatarUrl: string | null; lastMessageAt: string | null }[]
  >([])
  const [incomingModalOpen, setIncomingModalOpen] = useState(false)
  const [hiddenIncomingIds, setHiddenIncomingIds] = useState<string[]>([])
  const [showHiddenIncoming, setShowHiddenIncoming] = useState(false)
  const [roomStatsSubject, setRoomStatsSubject] = useState<DashboardRoomModalSubject | null>(null)
  const [roomChatModalOpen, setRoomChatModalOpen] = useState(false)
  const [roomChatModalId, setRoomChatModalId] = useState<string | null>(null)
  const [roomChatModalSummary, setRoomChatModalSummary] = useState<RoomChatConversationSummary | null>(null)
  const [roomArchiveRefreshKey, setRoomArchiveRefreshKey] = useState(0)
  const [deleteRoomFromListTarget, setDeleteRoomFromListTarget] = useState<RoomChatConversationSummary | null>(null)
  const [deleteRoomFromListBusy, setDeleteRoomFromListBusy] = useState(false)
  const [roomArchiveActionErr, setRoomArchiveActionErr] = useState<string | null>(null)

  const refreshHiddenIncoming = useCallback(() => {
    if (!user?.id) {
      setHiddenIncomingIds([])
      return
    }
    setHiddenIncomingIds(readHiddenIncomingPinIds(user.id))
  }, [user?.id])

  useEffect(() => {
    refreshHiddenIncoming()
  }, [refreshHiddenIncoming, contactsTick])

  useEffect(() => {
    if (!profile) return
    const merged = mergeRoomUiPrefs(profile.room_ui_preferences)
    setRoomLayout(merged.layout_mode)
    setRoomShowLayoutToggle(merged.show_layout_toggle)
    setRoomHideVideoLetterboxing(merged.hide_video_letterboxing)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    setSearchClosed(profile.profile_search_closed)
    setAllowSearchName(profile.profile_search_allow_by_name)
    setAllowSearchEmail(profile.profile_search_allow_by_email)
    setAllowSearchSlug(profile.profile_search_allow_by_slug)
    setSearchPrivacyErr(null)
    setDmAllowFrom(profile.dm_allow_from)
    setProfileViewAllowFrom(profile.profile_view_allow_from)
    setProfileShowAvatar(profile.profile_show_avatar)
    setProfileShowSlug(profile.profile_show_slug)
    setHideActivity(!profile.profile_show_last_active)
    setHideOnlineStatus(!profile.profile_show_online)
    setProfileDmReceiptsPrivate(profile.profile_dm_receipts_private)
    setContactPrivacyErr(null)
    privacyAutosaveSkipRef.current = true
    queueMicrotask(() => {
      privacyAutosaveSkipRef.current = false
    })
  }, [profile])

  useEffect(() => {
    let alive = true
    void listMyContacts().then((r) => {
      if (!alive) return
      if (!r.error) setContacts(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [contactsTick])

  useEffect(() => {
    let alive = true
    const uid = user?.id?.trim()
    if (!uid) {
      setMyRooms([])
      setRoomArchiveItems([])
      return
    }
    setMyRoomsLoading(true)
    setRoomArchiveLoading(true)
    void (async () => {
      const [roomsRes, archRes] = await Promise.all([
        fetchPersistentSpaceRoomsForUser(uid),
        listRoomChatConversationsForUser(uid, { limit: ROOM_CHAT_PAGE_SIZE, offset: 0 }),
      ])
      if (!alive) return
      if (!roomsRes.error) setMyRooms(roomsRes.data ?? [])
      else setMyRooms([])
      setMyRoomsLoading(false)
      if (!archRes.error) setRoomArchiveItems(archRes.data ?? [])
      else setRoomArchiveItems([])
      setRoomArchiveLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [user?.id, roomArchiveRefreshKey])

  useEffect(() => {
    void listMessengerPeersByMessageCount(6).then((r) => {
      if (!r.error && r.data) setPeerTop(r.data)
      else setPeerTop([])
    })
  }, [user?.id, contactsTick])

  useEffect(() => {
    if (!profile || privacyAutosaveSkipRef.current) return
    const t = window.setTimeout(() => {
      void (async () => {
        setSearchPrivacyErr(null)
        const { error: err } = await saveSearchPrivacy({
          profile_search_closed: searchClosed,
          profile_search_allow_by_name: allowSearchName,
          profile_search_allow_by_email: allowSearchEmail,
          profile_search_allow_by_slug: allowSearchSlug,
        })
        if (err) setSearchPrivacyErr(err)
      })()
    }, 450)
    return () => window.clearTimeout(t)
  }, [profile, searchClosed, allowSearchName, allowSearchEmail, allowSearchSlug, saveSearchPrivacy])

  useEffect(() => {
    if (!profile || privacyAutosaveSkipRef.current) return
    const t = window.setTimeout(() => {
      void (async () => {
        setContactPrivacyErr(null)
        const { error: err } = await saveContactPrivacy({
          dm_allow_from: dmAllowFrom,
          profile_view_allow_from: profileViewAllowFrom,
          profile_show_avatar: profileShowAvatar,
          profile_show_slug: profileShowSlug,
          profile_show_last_active: !hideActivity,
          profile_show_online: !hideOnlineStatus,
          profile_dm_receipts_private: profileDmReceiptsPrivate,
        })
        if (err) setContactPrivacyErr(err)
      })()
    }, 450)
    return () => window.clearTimeout(t)
  }, [
    profile,
    dmAllowFrom,
    profileViewAllowFrom,
    profileShowAvatar,
    profileShowSlug,
    hideActivity,
    hideOnlineStatus,
    profileDmReceiptsPrivate,
    saveContactPrivacy,
  ])

  const handleSaveRoomPrefs = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setRoomSaving(true)
    setRoomSaveMsg(null)
    setRoomSaveErr(null)

    const { data, error: fetchErr } = await supabase
      .from('users')
      .select('room_ui_preferences')
      .eq('id', user.id)
      .single()

    if (fetchErr) {
      setRoomSaving(false)
      setRoomSaveErr(fetchErr.message)
      return
    }

    const merged = mergeRoomUiPrefs(data?.room_ui_preferences)
    const next = {
      layout_mode: roomLayout,
      show_layout_toggle: roomShowLayoutToggle,
      hide_video_letterboxing: roomHideVideoLetterboxing,
      ...(merged.pip ? { pip: { pos: merged.pip.pos, size: merged.pip.size } } : {}),
    }

    const { error: upErr } = await supabase
      .from('users')
      .update({ room_ui_preferences: next, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    setRoomSaving(false)
    if (upErr) setRoomSaveErr(upErr.message)
    else setRoomSaveMsg('Сохранено')
  }

  const persistentSlugs = useMemo(() => new Set(myRooms.map((r) => r.slug)), [myRooms])
  const persistentPreview = useMemo(() => myRooms.slice(0, 3), [myRooms])
  const temporaryPreview = useMemo(() => {
    return roomArchiveItems
      .filter((it) => it.roomSlug && !persistentSlugs.has(it.roomSlug))
      .slice(0, 6)
  }, [roomArchiveItems, persistentSlugs])

  const joinableSlugs = useMemo(() => {
    const s = new Set<string>()
    for (const r of myRooms) {
      if (r.status === 'open' && r.slug?.trim()) s.add(r.slug.trim())
    }
    return s
  }, [myRooms])

  const hiddenIncomingSet = useMemo(() => new Set(hiddenIncomingIds), [hiddenIncomingIds])
  const incomingRequests = useMemo(
    () => contacts.filter((c) => c.pinnedMe && !c.pinnedByMe),
    [contacts],
  )
  const visibleIncomingCount = useMemo(
    () => incomingRequests.filter((c) => !hiddenIncomingSet.has(c.targetUserId)).length,
    [incomingRequests, hiddenIncomingSet],
  )

  const searchOpen = !searchClosed
  const noSearchAxes = searchOpen && !allowSearchName && !allowSearchEmail && !allowSearchSlug

  if (loading) {
    return (
      <DashboardShell active="cabinet" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
        <div className="auth-loading" aria-label="Загрузка..." />
      </DashboardShell>
    )
  }

  if (error || !profile) {
    return (
      <DashboardShell active="cabinet" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
        <p className="join-error">{error ?? 'Не удалось загрузить профиль'}</p>
      </DashboardShell>
    )
  }

  const initials = profile.display_name.charAt(0).toUpperCase()

  return (
    <DashboardShell active="cabinet" canAccessAdmin={canAccessAdmin} onSignOut={() => signOut()}>
      <DashboardContactsIncomingModal
        open={incomingModalOpen}
        onClose={() => setIncomingModalOpen(false)}
        userId={user?.id ?? ''}
        items={contacts}
        hiddenIds={hiddenIncomingIds}
        showHidden={showHiddenIncoming}
        onShowHiddenChange={setShowHiddenIncoming}
        onHiddenChange={() => {
          refreshHiddenIncoming()
        }}
        onContactsUpdated={() => {
          setContactsTick((n) => n + 1)
        }}
      />

      {user?.id ? (
        <>
          <DashboardRoomStatsModal
            open={roomStatsSubject !== null}
            subject={roomStatsSubject}
            joinableSlugs={joinableSlugs}
            currentUserId={user.id}
            onClose={() => setRoomStatsSubject(null)}
            onOpenChat={(p) => {
              if (p.summary.messageCount <= 0) return
              setRoomChatModalSummary(p.summary)
              setRoomChatModalId(p.conversationId)
              setRoomChatModalOpen(true)
              setRoomStatsSubject(null)
            }}
            onRemoveFromList={
              roomStatsSubject?.kind === 'archive'
                ? () => {
                    setDeleteRoomFromListTarget(roomStatsSubject.summary)
                    setRoomStatsSubject(null)
                  }
                : undefined
            }
            removeFromListBusy={deleteRoomFromListBusy}
          />
          <RoomChatArchiveModal
            open={roomChatModalOpen}
            conversationId={roomChatModalId}
            summary={roomChatModalSummary}
            userId={user.id}
            onClose={() => {
              setRoomChatModalOpen(false)
              setRoomChatModalId(null)
              setRoomChatModalSummary(null)
            }}
          />
          <ConfirmDialog
            open={Boolean(deleteRoomFromListTarget)}
            title="Убрать комнату из списка?"
            message={
              <div className="dashboard-rooms-delete-confirm">
                <p>
                  Запись о комнате «{deleteRoomFromListTarget?.title ?? '—'}» исчезнет только у вас. У других участников
                  эфира доступ к чату сохранится.
                </p>
                <p>
                  <strong>Важно:</strong> если в этом чате не было сообщений, диалог будет удалён из базы целиком — у
                  всех пропадёт пустая запись. Если сообщения были, история останется у тех, кто не удалял запись.
                </p>
                <p className="dashboard-rooms-delete-confirm--warn">
                  У вас локально переписка из этого списка больше не отобразится; восстановить только вашу «закладку»
                  без повторного входа в эфир нельзя.
                </p>
              </div>
            }
            confirmLabel="Удалить из списка"
            cancelLabel="Отмена"
            confirmLoading={deleteRoomFromListBusy}
            onCancel={() => {
              if (!deleteRoomFromListBusy) setDeleteRoomFromListTarget(null)
            }}
            onConfirm={() => {
              void (async () => {
                if (!deleteRoomFromListTarget) return
                setRoomArchiveActionErr(null)
                setDeleteRoomFromListBusy(true)
                const res = await leaveRoomChatArchiveEntry(deleteRoomFromListTarget.id)
                setDeleteRoomFromListBusy(false)
                if (!res.ok) {
                  setRoomArchiveActionErr(res.error ?? 'Не удалось убрать из списка.')
                  setDeleteRoomFromListTarget(null)
                  return
                }
                const removedId = deleteRoomFromListTarget.id
                setDeleteRoomFromListTarget(null)
                if (roomChatModalId === removedId) {
                  setRoomChatModalOpen(false)
                  setRoomChatModalId(null)
                  setRoomChatModalSummary(null)
                }
                setRoomArchiveRefreshKey((k) => k + 1)
              })()
            }}
          />
        </>
      ) : null}

      <div className="dashboard-tiles-wrap">
        <div className="dashboard-tiles">
        <section className="dashboard-tile dashboard-tile--profile">
          <h2 className="dashboard-tile__title">Профиль и аккаунт</h2>
          <div className="dashboard-tile-profile">
            <button
              type="button"
              className="dashboard-tile-profile__avatar"
              aria-label="Просмотр профиля"
              onClick={() => {
                if (user?.id) {
                  openUserPeek({
                    userId: user.id,
                    displayName: profile.display_name,
                    avatarUrl: profile.avatar_url,
                  })
                }
              }}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.display_name} />
              ) : (
                <span className="dashboard-tile-profile__initials">{initials}</span>
              )}
            </button>
            <div className="dashboard-tile-profile__main">
              <div className="dashboard-tile-profile__line">
                <span className="dashboard-tile-profile__name">{profile.display_name}</span>
                <button
                  type="button"
                  className="dashboard-tile-profile__settings"
                  title="Настройки профиля"
                  aria-label="Настройки профиля"
                  onClick={() => openProfileEdit()}
                >
                  <SettingsGearIcon />
                </button>
              </div>
              {profile.profile_slug ? (
                <span className="dashboard-tile-profile__nick">@{profile.profile_slug}</span>
              ) : null}
              <span className="dashboard-tile-profile__email" title={profile.email ?? undefined}>
                {profile.email ?? '—'}
              </span>
              <div className="dashboard-tile-profile__badges">
                <span className={`dashboard-badge ${STATUS_CLASS[profile.status] ?? ''}`}>
                  {STATUS_LABEL[profile.status] ?? profile.status}
                </span>
                {profile.global_roles.length > 0 ? (
                  <div className="dashboard-role-badges">
                    {profile.global_roles.map((role) => (
                      <span
                        key={role.code}
                        className={globalRoleBadgeClass(role.code)}
                        title={role.title ? `${role.title} (${role.code})` : role.code}
                      >
                        {GLOBAL_ROLE_LABEL[role.code] ?? role.title ?? role.code}
                      </span>
                    ))}
                  </div>
                ) : null}
                <span className="dashboard-plan dashboard-plan--inline">
                  <span className="dashboard-plan__name">{plan?.plan_name ?? 'Free'}</span>
                  {plan?.sub_status ? (
                    <span className="dashboard-badge dashboard-badge--active">{plan.sub_status}</span>
                  ) : null}
                </span>
              </div>
            </div>
          </div>
          <div className="dashboard-tile__flex-fill" aria-hidden />
        </section>

        <section className="dashboard-tile dashboard-tile--contact-privacy">
          <h2 className="dashboard-tile__title">Приватность</h2>
          <div className="dashboard-form dashboard-form--compact">
            <p className="dashboard-field__hint" style={{ marginTop: 0 }}>
              Глобальный поиск в «Контактах», кто может написать первым, что видно в карточке профиля и индикаторы
              доставки в личных сообщениях. Изменения сохраняются автоматически.
            </p>
            {searchPrivacySaving || contactPrivacySaving ? (
              <p className="dashboard-field__hint" role="status">
                Сохранение…
              </p>
            ) : null}

            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Профиль в глобальном поиске</span>
                <PillToggle
                  checked={searchOpen}
                  onCheckedChange={(next) => {
                    setSearchClosed(!next)
                    setSearchPrivacyErr(null)
                  }}
                  ariaLabel="Профиль в глобальном поиске"
                />
              </div>
            </div>
            <div className="dashboard-field">
              <span className="dashboard-field__label">Разрешить находить по</span>
              <div className="dashboard-field__stack">
                <div className="dashboard-field__inline dashboard-field__inline--toggle">
                  <span className="dashboard-field__sublabel">Имени</span>
                  <PillToggle
                    compact
                    checked={allowSearchName}
                    onCheckedChange={setAllowSearchName}
                    ariaLabel="Поиск по имени"
                    disabled={!searchOpen}
                  />
                </div>
                <div className="dashboard-field__inline dashboard-field__inline--toggle">
                  <span className="dashboard-field__sublabel">Электронной почте</span>
                  <PillToggle
                    compact
                    checked={allowSearchEmail}
                    onCheckedChange={setAllowSearchEmail}
                    ariaLabel="Поиск по email"
                    disabled={!searchOpen}
                  />
                </div>
                <div className="dashboard-field__inline dashboard-field__inline--toggle">
                  <span className="dashboard-field__sublabel">Имени пользователя (@ник)</span>
                  <PillToggle
                    compact
                    checked={allowSearchSlug}
                    onCheckedChange={setAllowSearchSlug}
                    ariaLabel="Поиск по имени пользователя"
                    disabled={!searchOpen}
                  />
                </div>
              </div>
              {!searchOpen ? (
                <p className="dashboard-field__note">Пока профиль закрыт, вы не отображаетесь в поиске.</p>
              ) : null}
              {noSearchAxes ? (
                <p className="join-error">
                  Включён открытый режим, но не выбран ни один способ поиска — вас никто не найдёт, пока не включите
                  хотя бы один пункт.
                </p>
              ) : null}
            </div>
            {searchPrivacyErr ? <p className="join-error">{searchPrivacyErr}</p> : null}

            <div className="dashboard-field" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <label className="dashboard-field__label">Личные сообщения</label>
              <select
                className="dashboard-chat-filters__input"
                value={dmAllowFrom}
                onChange={(e) => setDmAllowFrom(e.target.value === 'contacts_only' ? 'contacts_only' : 'everyone')}
                aria-label="Кто может начать личный чат"
              >
                <option value="everyone">Все зарегистрированные</option>
                <option value="contacts_only">Только взаимные контакты</option>
              </select>
            </div>
            <div className="dashboard-field">
              <label className="dashboard-field__label">Карточка профиля для других</label>
              <select
                className="dashboard-chat-filters__input"
                value={profileViewAllowFrom}
                onChange={(e) =>
                  setProfileViewAllowFrom(e.target.value === 'contacts_only' ? 'contacts_only' : 'everyone')
                }
                aria-label="Кто видит данные профиля"
              >
                <option value="everyone">Все зарегистрированные</option>
                <option value="contacts_only">Только взаимные контакты</option>
              </select>
            </div>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Показывать аватар</span>
                <PillToggle
                  checked={profileShowAvatar}
                  onCheckedChange={setProfileShowAvatar}
                  ariaLabel="Показывать аватар в карточке"
                />
              </div>
            </div>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Показывать ник (@slug)</span>
                <PillToggle
                  checked={profileShowSlug}
                  onCheckedChange={setProfileShowSlug}
                  ariaLabel="Показывать ник в карточке"
                />
              </div>
            </div>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Скрывать время последней активности</span>
                <PillToggle
                  checked={hideActivity}
                  onCheckedChange={setHideActivity}
                  ariaLabel="Скрывать время последней активности от других"
                />
              </div>
            </div>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Скрывать статус «в сети»</span>
                <PillToggle
                  checked={hideOnlineStatus}
                  onCheckedChange={setHideOnlineStatus}
                  ariaLabel="Скрывать статус «в сети» от других"
                />
              </div>
            </div>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Скрывать статусы доставки и прочтения в ЛС</span>
                <PillToggle
                  checked={profileDmReceiptsPrivate}
                  onCheckedChange={setProfileDmReceiptsPrivate}
                  ariaLabel="Не показывать собеседникам доставку и прочтение исходящих сообщений"
                />
              </div>
            </div>
            {contactPrivacyErr ? <p className="join-error">{contactPrivacyErr}</p> : null}
          </div>
        </section>

        <section className="dashboard-tile dashboard-tile--rooms">
          <h2 className="dashboard-tile__title">Комнаты</h2>
          {roomArchiveActionErr ? <p className="join-error dashboard-tile__hint">{roomArchiveActionErr}</p> : null}
          <div className="dashboard-tile__grow">
          {myRoomsLoading || roomArchiveLoading ? (
            <p className="dashboard-tile__hint">Загрузка…</p>
          ) : (
            <>
              <h3 className="dashboard-tile__subtitle">Постоянные</h3>
              {persistentPreview.length === 0 ? (
                <p className="dashboard-tile__hint">Пока нет постоянных комнат.</p>
              ) : (
                <ul className="dashboard-my-rooms__list">
                  {persistentPreview.map((r) => {
                    const label = r.displayName?.trim() || r.slug
                    const showTitle = Boolean(r.displayName?.trim())
                    return (
                      <li key={r.slug}>
                        <DashboardRoomRow
                          dateLabel={formatRoomTileDate(r.createdAt)}
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
              <h3 className="dashboard-tile__subtitle">Недавние</h3>
              {temporaryPreview.length === 0 ? (
                <p className="dashboard-tile__hint">Временных комнат в списке пока нет.</p>
              ) : (
                <ul className="dashboard-my-rooms__list">
                  {temporaryPreview.map((it) => {
                    const slug = it.roomSlug?.trim() ?? ''
                    const canJoin = Boolean(slug && joinableSlugs.has(slug))
                    return (
                      <li key={it.id}>
                        <DashboardRoomRow
                          dateLabel={formatRoomTileDate(it.lastMessageAt ?? it.createdAt)}
                          title={it.title}
                          titleHint={it.title}
                          meta={`${it.messageCount} сообщ.`}
                          isOpen={!it.closedAt}
                          showCamLink={canJoin}
                          camHref={canJoin ? `/r/${encodeURIComponent(slug)}` : undefined}
                          onOpenStats={() => setRoomStatsSubject({ kind: 'archive', summary: it })}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
          </div>
          <Link to="/dashboard/chats" className="dashboard-tile__more">
            Подробнее
          </Link>
        </section>

        <section className="dashboard-tile dashboard-tile--friends">
          <h2 className="dashboard-tile__title">Контакты</h2>
          <div className="dashboard-tile-friends__head">
            <span className="dashboard-tile-friends__label">Входящие от других</span>
            {visibleIncomingCount > 0 ? (
              <span className="dashboard-tile-friends__count">{visibleIncomingCount}</span>
            ) : (
              <span className="dashboard-tile-friends__count dashboard-tile-friends__count--zero">0</span>
            )}
            <button type="button" className="dashboard-tile__more-btn" onClick={() => setIncomingModalOpen(true)}>
              Подробнее
            </button>
          </div>
          <div className="dashboard-tile-friends__grid" aria-label="Чаще всего в личных сообщениях">
            {peerTop.length === 0 ? (
              <p className="dashboard-tile__hint dashboard-tile-friends__grid-empty">Нет данных по перепискам.</p>
            ) : (
              peerTop.map((p) => {
                const name = contacts.find((c) => c.targetUserId === p.userId)?.displayName ?? 'Гость'
                const msgSp = new URLSearchParams()
                msgSp.set('with', p.userId)
                if (name.trim()) msgSp.set('title', name.trim())
                return (
                  <div key={p.userId} className="dashboard-tile-friends__card-wrap">
                    <button
                      type="button"
                      className="dashboard-tile-friends__card"
                      title={`${p.messageCount} сообщ.`}
                      onClick={() =>
                        openUserPeek({
                          userId: p.userId,
                          displayName: name,
                          avatarUrl: p.avatarUrl,
                        })
                      }
                    >
                      <div className="dashboard-tile-friends__card-avatar">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" />
                        ) : (
                          <span>{name.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="dashboard-tile-friends__card-name" title={name}>
                        {name}
                      </div>
                      <div className="dashboard-tile-friends__card-time">{formatPeerGuestTime(p.lastMessageAt)}</div>
                    </button>
                    <Link
                      to={`/dashboard/messenger?${msgSp.toString()}`}
                      className="dashboard-tile-friends__msg"
                      title="Личный чат"
                      aria-label="Открыть личный чат"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ChatBubbleIcon />
                    </Link>
                  </div>
                )
              })
            )}
          </div>
          <Link to="/dashboard/contacts" className="dashboard-tile__more">
            Подробнее — все контакты
          </Link>
        </section>

        <section className="dashboard-tile dashboard-tile--room-prefs">
          <h2 className="dashboard-tile__title">Настройки комнаты по умолчанию</h2>
          <form onSubmit={handleSaveRoomPrefs} className="dashboard-form dashboard-form--compact">
            <div className="dashboard-field">
              <div className="dashboard-field__inline">
                <span className="dashboard-field__label">Вид</span>
                <DashboardLayoutPicker value={roomLayout} onChange={setRoomLayout} />
              </div>
            </div>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Кнопка смены вида</span>
                <PillToggle
                  checked={roomShowLayoutToggle}
                  onCheckedChange={setRoomShowLayoutToggle}
                  offLabel="Скрыта"
                  onLabel="Показана"
                  ariaLabel="Показывать круглую кнопку смены вида в комнате"
                />
              </div>
            </div>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Скрывать поля у камеры</span>
                <PillToggle
                  checked={roomHideVideoLetterboxing}
                  onCheckedChange={setRoomHideVideoLetterboxing}
                  offLabel="Нет"
                  onLabel="Да"
                  ariaLabel="Обрезать видео камеры под плитку без чёрных полей"
                />
              </div>
            </div>
            {roomSaveErr ? <p className="join-error">{roomSaveErr}</p> : null}
            {roomSaveMsg ? <p className="dashboard-save-ok">{roomSaveMsg}</p> : null}
            <button type="submit" className="join-btn dashboard-form__save" disabled={roomSaving}>
              {roomSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </form>
        </section>
        </div>
      </div>
    </DashboardShell>
  )
}
