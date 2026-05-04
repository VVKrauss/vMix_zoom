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
import {
  supabase,
} from '../lib/supabase'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'
import { APP_VERSION } from '../config/version'
import { DashboardContactsIncomingModal } from './DashboardContactsIncomingModal'
import { DashboardLayoutPicker } from './DashboardLayoutPicker'
import { DashboardMenuPicker } from './DashboardMenuPicker'
import { PillToggle } from './PillToggle'
import { DashboardAppReleaseCheck } from './DashboardAppReleaseCheck'
import { DashboardShell } from './DashboardShell'
import { ConfirmDialog } from './ConfirmDialog'
import { DashboardRoomRow } from './DashboardRoomRow'
import { DashboardRoomStatsModal } from './DashboardRoomStatsModal'
import { RoomChatArchiveModal } from './RoomChatArchiveModal'
import { ChatBubbleIcon, ChevronLeftIcon, ChevronRightIcon, FiRrIcon, LogOutIcon, RoomsIcon, SettingsGearIcon } from './icons'

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

type SettingsScreen =
  | 'root'
  | 'search'
  | 'visibility'
  | 'messages'
  | 'roomPrefs'
  | 'network'

type Audience = 'everyone' | 'contacts_only' | 'nobody'

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'everyone', label: 'Все' },
  { value: 'contacts_only', label: 'Контакты' },
  { value: 'nobody', label: 'Никто' },
]

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
  const roomAutosaveSkipRef = useRef(true)
  const [searchClosed, setSearchClosed] = useState(true)
  const [allowSearchName, setAllowSearchName] = useState(true)
  const [allowSearchEmail, setAllowSearchEmail] = useState(false)
  const [allowSearchSlug, setAllowSearchSlug] = useState(true)
  const [searchPrivacyErr, setSearchPrivacyErr] = useState<string | null>(null)
  const [dmAudience, setDmAudience] = useState<Audience>('everyone')
  const [voiceAudience, setVoiceAudience] = useState<Audience>('everyone')
  const [groupInviteAudience, setGroupInviteAudience] = useState<Audience>('everyone')
  const [channelInviteAudience, setChannelInviteAudience] = useState<Audience>('everyone')
  const [profileViewAllowFrom, setProfileViewAllowFrom] = useState<Audience>('everyone')
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
  const [settingsScreen, setSettingsScreen] = useState<SettingsScreen>('root')
  const [expandedSettingsSection, setExpandedSettingsSection] = useState<SettingsScreen | null>(null)
  const isDesktopSettings = useMediaQuery('(min-width: 901px)')
  const appReleaseCheckActive = useMemo(
    () => settingsScreen === 'network' || (isDesktopSettings && expandedSettingsSection === 'network'),
    [settingsScreen, isDesktopSettings, expandedSettingsSection],
  )

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
    setRoomSaveErr(null)
    setRoomSaveMsg(null)
    roomAutosaveSkipRef.current = true
    queueMicrotask(() => {
      roomAutosaveSkipRef.current = false
    })
  }, [profile])

  useEffect(() => {
    if (!profile) return
    setSearchClosed(profile.profile_search_closed)
    setAllowSearchName(profile.profile_search_allow_by_name)
    setAllowSearchEmail(profile.profile_search_allow_by_email)
    setAllowSearchSlug(profile.profile_search_allow_by_slug)
    setSearchPrivacyErr(null)
    setDmAudience(profile.dm_allow_from)
    setVoiceAudience(profile.dm_allow_from)
    setGroupInviteAudience(profile.dm_allow_from)
    setChannelInviteAudience(profile.dm_allow_from)
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
    const searchDirty =
      searchClosed !== profile.profile_search_closed ||
      allowSearchName !== profile.profile_search_allow_by_name ||
      allowSearchEmail !== profile.profile_search_allow_by_email ||
      allowSearchSlug !== profile.profile_search_allow_by_slug
    if (!searchDirty) return
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
    const effectiveDmAllowFrom: 'everyone' | 'contacts_only' =
      dmAudience === 'nobody' ? 'contacts_only' : dmAudience
    const effectiveProfileViewAllowFrom: 'everyone' | 'contacts_only' =
      profileViewAllowFrom === 'nobody' ? 'contacts_only' : profileViewAllowFrom
    const contactDirty =
      effectiveDmAllowFrom !== profile.dm_allow_from ||
      effectiveProfileViewAllowFrom !== profile.profile_view_allow_from ||
      profileShowAvatar !== profile.profile_show_avatar ||
      profileShowSlug !== profile.profile_show_slug ||
      !hideActivity !== profile.profile_show_last_active ||
      !hideOnlineStatus !== profile.profile_show_online ||
      profileDmReceiptsPrivate !== profile.profile_dm_receipts_private
    if (!contactDirty) return
    const t = window.setTimeout(() => {
      void (async () => {
        setContactPrivacyErr(null)
        const { error: err } = await saveContactPrivacy({
          dm_allow_from: effectiveDmAllowFrom,
          profile_view_allow_from: effectiveProfileViewAllowFrom,
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
    dmAudience,
    profileViewAllowFrom,
    profileShowAvatar,
    profileShowSlug,
    hideActivity,
    hideOnlineStatus,
    profileDmReceiptsPrivate,
    saveContactPrivacy,
  ])

  useEffect(() => {
    if (!profile || !user || roomAutosaveSkipRef.current) return
    const merged = mergeRoomUiPrefs(profile.room_ui_preferences)
    const roomPrefsDirty =
      roomLayout !== merged.layout_mode ||
      roomShowLayoutToggle !== merged.show_layout_toggle ||
      roomHideVideoLetterboxing !== merged.hide_video_letterboxing
    if (!roomPrefsDirty) return
    const t = window.setTimeout(() => {
      void (async () => {
        setRoomSaving(true)
        setRoomSaveErr(null)
        setRoomSaveMsg(null)

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
      })()
    }, 450)
    return () => window.clearTimeout(t)
  }, [profile, user, roomLayout, roomShowLayoutToggle, roomHideVideoLetterboxing])

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

  const toAudienceLabel = (value: Audience): string => {
    if (value === 'contacts_only') return 'Контакты'
    if (value === 'nobody') return 'Никто'
    return 'Все'
  }

  const settingsMenuLabel = (screen: SettingsScreen): string => {
    if (screen === 'search') return 'Глобальный поиск'
    if (screen === 'visibility') return 'Видимость на сайте'
    if (screen === 'messages') return 'Сообщения'
    if (screen === 'roomPrefs') return 'Настройки комнат'
    if (screen === 'network') return 'Другие настройки'
    return ''
  }

  const openScreen = (screen: SettingsScreen) => {
    if (isDesktopSettings && (screen === 'search' || screen === 'visibility' || screen === 'messages' || screen === 'roomPrefs' || screen === 'network')) {
      setExpandedSettingsSection((prev) => (prev === screen ? null : screen))
      return
    }
    setSettingsScreen(screen)
    setSearchPrivacyErr(null)
    setContactPrivacyErr(null)
  }

  const settingsMenuRow = (screen: SettingsScreen, value?: string) => (
    <button type="button" className="dashboard-settings-row" onClick={() => openScreen(screen)}>
      <span>{settingsMenuLabel(screen)}</span>
      <span className="dashboard-settings-row__right">
        {value ? <span className="dashboard-settings-row__value">{value}</span> : null}
        {isDesktopSettings ? <FiRrIcon name="angle-small-down" /> : <ChevronRightIcon />}
      </span>
    </button>
  )

  const SettingsBack = ({ title }: { title: string }) => (
    <div className="dashboard-settings-back">
      <button
        type="button"
        className="join-back-arrow"
        onClick={() => setSettingsScreen('root')}
        title="Назад"
        aria-label="Назад"
      >
        <ChevronLeftIcon />
      </button>
      <h2 className="dashboard-settings-back__title">{title}</h2>
    </div>
  )

  const AudienceSelect = ({
    label,
    value,
    onChange,
  }: {
    label: string
    value: Audience
    onChange: (next: Audience) => void
  }) => (
    <div className="dashboard-settings-control-row">
      <span className="dashboard-settings-control-row__label">{label}</span>
      <div className="dashboard-settings-control-row__control">
        <DashboardMenuPicker
          value={value}
          onChange={onChange}
          options={AUDIENCE_OPTIONS}
          ariaLabelPrefix={label}
          modifierClass="admin-role-picker--dashboard-filters"
        />
      </div>
    </div>
  )

  const ToggleRow = ({
    label,
    checked,
    onChange,
    ariaLabel,
    compact = false,
    disabled = false,
    offLabel,
    onLabel,
  }: {
    label: string
    checked: boolean
    onChange: (next: boolean) => void
    ariaLabel: string
    compact?: boolean
    disabled?: boolean
    offLabel?: string
    onLabel?: string
  }) => (
    <div className="dashboard-settings-control-row">
      <span className="dashboard-settings-control-row__label">{label}</span>
      <div className="dashboard-settings-control-row__control">
        <PillToggle
          compact={compact}
          checked={checked}
          onCheckedChange={onChange}
          ariaLabel={ariaLabel}
          disabled={disabled}
          offLabel={offLabel}
          onLabel={onLabel}
        />
      </div>
    </div>
  )

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

      <div className="dashboard-tiles-wrap dashboard-tiles-wrap--settings">
        {settingsScreen === 'root' ? (
          <div className="dashboard-tiles dashboard-tiles--settings-root">
            <section className="dashboard-tile dashboard-tile--profile">
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
                  {profile.profile_slug ? <span className="dashboard-tile-profile__nick">@{profile.profile_slug}</span> : null}
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
                      {plan?.sub_status ? <span className="dashboard-badge dashboard-badge--active">{plan.sub_status}</span> : null}
                    </span>
                  </div>
                  <button type="button" className="dashboard-tile-profile__logout" onClick={() => signOut()}>
                    <LogOutIcon />
                    Выход
                  </button>
                </div>
              </div>
            </section>

            <div className="dashboard-settings-quick-between" aria-label="Быстрые разделы">
              <div className="dashboard-settings-quick-grid">
                <Link to="/dashboard/contacts" className="dashboard-settings-quick-tile">
                  <FiRrIcon name="users" className="dashboard-settings-quick-tile__icon" />
                  <span>Контакты</span>
                  {visibleIncomingCount > 0 ? (
                    <span className="dashboard-settings-quick-tile__badge">
                      {visibleIncomingCount > 99 ? '99+' : visibleIncomingCount}
                    </span>
                  ) : null}
                </Link>
                <Link to="/dashboard/chats" className="dashboard-settings-quick-tile">
                  <RoomsIcon />
                  <span>Комнаты</span>
                </Link>
              </div>
            </div>

            <section className="dashboard-tile dashboard-settings-list">
              {searchPrivacySaving || contactPrivacySaving || roomSaving ? (
                <p className="dashboard-field__hint" role="status">
                  Сохранение…
                </p>
              ) : null}
              {settingsMenuRow('search')}
              {isDesktopSettings && expandedSettingsSection === 'search' ? (
                <div className="dashboard-settings-expand">
                  <ToggleRow
                    label="Профиль в глобальном поиске"
                    checked={searchOpen}
                    onChange={(next) => setSearchClosed(!next)}
                    ariaLabel="Профиль в глобальном поиске"
                  />
                  <p className="dashboard-settings-group-title">Разрешить находить по</p>
                  <ToggleRow label="Имени" checked={allowSearchName} onChange={setAllowSearchName} ariaLabel="Поиск по имени" compact disabled={!searchOpen} />
                  <ToggleRow label="Электронной почте" checked={allowSearchEmail} onChange={setAllowSearchEmail} ariaLabel="Поиск по email" compact disabled={!searchOpen} />
                  <ToggleRow
                    label="Имени пользователя (@ник)"
                    checked={allowSearchSlug}
                    onChange={setAllowSearchSlug}
                    ariaLabel="Поиск по имени пользователя"
                    compact
                    disabled={!searchOpen}
                  />
                </div>
              ) : null}
              {settingsMenuRow('visibility', toAudienceLabel(profileViewAllowFrom))}
              {isDesktopSettings && expandedSettingsSection === 'visibility' ? (
                <div className="dashboard-settings-expand">
                  <AudienceSelect label="Кто может просматривать карточку" value={profileViewAllowFrom} onChange={setProfileViewAllowFrom} />
                  <ToggleRow label="Скрывать активность?" checked={hideActivity} onChange={setHideActivity} ariaLabel="Скрывать активность" />
                  <ToggleRow label="Скрывать «в сети»?" checked={hideOnlineStatus} onChange={setHideOnlineStatus} ariaLabel="Скрывать в сети" />
                  <ToggleRow
                    label="Скрывать «прочитано»?"
                    checked={profileDmReceiptsPrivate}
                    onChange={setProfileDmReceiptsPrivate}
                    ariaLabel="Скрывать прочитано"
                  />
                </div>
              ) : null}
              {settingsMenuRow('messages', toAudienceLabel(dmAudience))}
              {isDesktopSettings && expandedSettingsSection === 'messages' ? (
                <div className="dashboard-settings-expand">
                  <p className="dashboard-field__label" style={{ margin: '0 0 4px' }}>
                    Кто может:
                  </p>
                  <AudienceSelect label="Мне писать" value={dmAudience} onChange={setDmAudience} />
                  <AudienceSelect label="Отправлять голосовые" value={voiceAudience} onChange={setVoiceAudience} />
                  <AudienceSelect label="Приглашать в группы" value={groupInviteAudience} onChange={setGroupInviteAudience} />
                  <AudienceSelect label="Приглашать в каналы" value={channelInviteAudience} onChange={setChannelInviteAudience} />
                </div>
              ) : null}
              {settingsMenuRow('roomPrefs')}
              {isDesktopSettings && expandedSettingsSection === 'roomPrefs' ? (
                <div className="dashboard-settings-expand">
                  <div className="dashboard-settings-control-row">
                    <span className="dashboard-settings-control-row__label">Вид</span>
                    <div className="dashboard-settings-control-row__control">
                      <DashboardLayoutPicker value={roomLayout} onChange={setRoomLayout} />
                    </div>
                  </div>
                  <ToggleRow
                    label="Кнопка смены вида"
                    checked={roomShowLayoutToggle}
                    onChange={setRoomShowLayoutToggle}
                    ariaLabel="Кнопка смены вида"
                    offLabel="Скрыта"
                    onLabel="Показана"
                  />
                  <ToggleRow
                    label="Скрывать поля у камеры"
                    checked={roomHideVideoLetterboxing}
                    onChange={setRoomHideVideoLetterboxing}
                    ariaLabel="Скрывать поля у камеры"
                    offLabel="Нет"
                    onLabel="Да"
                  />
                  {roomSaving ? <p className="dashboard-field__hint">Сохранение…</p> : null}
                  {roomSaveErr ? <p className="join-error">{roomSaveErr}</p> : null}
                  {roomSaveMsg ? <p className="dashboard-save-ok">{roomSaveMsg}</p> : null}
                </div>
              ) : null}
              {settingsMenuRow('network', APP_VERSION)}
              {isDesktopSettings && expandedSettingsSection === 'network' ? (
                <div className="dashboard-settings-expand">
                  <p className="dashboard-field__label">Версия приложения</p>
                  <p className="dashboard-field__hint">{APP_VERSION}</p>
                  <DashboardAppReleaseCheck active={appReleaseCheckActive} />
                </div>
              ) : null}
              {searchPrivacyErr ? <p className="join-error">{searchPrivacyErr}</p> : null}
              {contactPrivacyErr ? <p className="join-error">{contactPrivacyErr}</p> : null}
              {noSearchAxes ? (
                <p className="dashboard-field__note">Глобальный поиск включён, но все способы поиска отключены.</p>
              ) : null}
            </section>
          </div>
        ) : settingsScreen === 'search' ? (
          <section className="dashboard-tile dashboard-settings-page">
            <SettingsBack title="Глобальный поиск" />
            <div className="dashboard-form dashboard-form--compact">
              <ToggleRow
                label="Профиль в глобальном поиске"
                checked={searchOpen}
                onChange={(next) => setSearchClosed(!next)}
                ariaLabel="Профиль в глобальном поиске"
              />
              <p className="dashboard-settings-group-title">Разрешить находить по</p>
              <ToggleRow label="Имени" checked={allowSearchName} onChange={setAllowSearchName} ariaLabel="Поиск по имени" compact disabled={!searchOpen} />
              <ToggleRow label="Электронной почте" checked={allowSearchEmail} onChange={setAllowSearchEmail} ariaLabel="Поиск по email" compact disabled={!searchOpen} />
              <ToggleRow
                label="Имени пользователя (@ник)"
                checked={allowSearchSlug}
                onChange={setAllowSearchSlug}
                ariaLabel="Поиск по имени пользователя"
                compact
                disabled={!searchOpen}
              />
            </div>
          </section>
        ) : settingsScreen === 'visibility' ? (
          <section className="dashboard-tile dashboard-settings-page">
            <SettingsBack title="Видимость на сайте" />
            <div className="dashboard-form dashboard-form--compact">
              <AudienceSelect label="Кто может просматривать карточку" value={profileViewAllowFrom} onChange={setProfileViewAllowFrom} />
              <ToggleRow label="Скрывать активность?" checked={hideActivity} onChange={setHideActivity} ariaLabel="Скрывать активность" />
              <ToggleRow label="Скрывать «в сети»?" checked={hideOnlineStatus} onChange={setHideOnlineStatus} ariaLabel="Скрывать в сети" />
              <ToggleRow
                label="Скрывать «прочитано»?"
                checked={profileDmReceiptsPrivate}
                onChange={setProfileDmReceiptsPrivate}
                ariaLabel="Скрывать прочитано"
              />
            </div>
          </section>
        ) : settingsScreen === 'messages' ? (
          <section className="dashboard-tile dashboard-settings-page">
            <SettingsBack title="Сообщения" />
            <div className="dashboard-form dashboard-form--compact">
              <p className="dashboard-field__label" style={{ margin: '0 0 4px' }}>
                Кто может:
              </p>
              <AudienceSelect label="Мне писать" value={dmAudience} onChange={setDmAudience} />
              <AudienceSelect label="Отправлять голосовые" value={voiceAudience} onChange={setVoiceAudience} />
              <AudienceSelect label="Приглашать в группы" value={groupInviteAudience} onChange={setGroupInviteAudience} />
              <AudienceSelect label="Приглашать в каналы" value={channelInviteAudience} onChange={setChannelInviteAudience} />
            </div>
          </section>
        ) : settingsScreen === 'roomPrefs' ? (
          <section className="dashboard-tile dashboard-settings-page">
            <SettingsBack title="Настройки комнат" />
            <div className="dashboard-form dashboard-form--compact">
              <div className="dashboard-settings-control-row">
                <span className="dashboard-settings-control-row__label">Вид</span>
                <div className="dashboard-settings-control-row__control">
                  <DashboardLayoutPicker value={roomLayout} onChange={setRoomLayout} />
                </div>
              </div>
              <ToggleRow
                label="Кнопка смены вида"
                checked={roomShowLayoutToggle}
                onChange={setRoomShowLayoutToggle}
                ariaLabel="Кнопка смены вида"
                offLabel="Скрыта"
                onLabel="Показана"
              />
              <ToggleRow
                label="Скрывать поля у камеры"
                checked={roomHideVideoLetterboxing}
                onChange={setRoomHideVideoLetterboxing}
                ariaLabel="Скрывать поля у камеры"
                offLabel="Нет"
                onLabel="Да"
              />
              {roomSaving ? <p className="dashboard-field__hint">Сохранение…</p> : null}
              {roomSaveErr ? <p className="join-error">{roomSaveErr}</p> : null}
              {roomSaveMsg ? <p className="dashboard-save-ok">{roomSaveMsg}</p> : null}
            </div>
          </section>
        ) : settingsScreen === 'network' ? (
          <section className="dashboard-tile dashboard-settings-page">
            <SettingsBack title="Другие настройки" />
            <p className="dashboard-field__label">Версия приложения</p>
            <p className="dashboard-field__hint">{APP_VERSION}</p>
            <DashboardAppReleaseCheck active={appReleaseCheckActive} />
          </section>
        ) : null}
      </div>
    </DashboardShell>
  )
}
