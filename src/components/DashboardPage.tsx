import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useUserPeek } from '../context/UserPeekContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useProfile } from '../hooks/useProfile'
import { deleteMyAccount } from '../lib/accountLifecycle'
import {
  type RoomChatConversationSummary,
  ROOM_CHAT_PAGE_SIZE,
  listRoomChatConversationsForUser,
} from '../lib/chatArchive'
import { readHiddenIncomingFavoriteIds } from '../lib/dashboardIncomingFavoritesHidden'
import { listMessengerPeersByMessageCount } from '../lib/messenger'
import { normalizeProfileSlug, validateProfileSlugInput } from '../lib/profileSlug'
import type { ContactCard } from '../lib/socialGraph'
import { listMyContacts } from '../lib/socialGraph'
import { fetchPersistentSpaceRoomsForUser, type PersistentSpaceRoomRow } from '../lib/spaceRoom'
import { supabase } from '../lib/supabase'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'
import { DashboardFriendsIncomingModal } from './DashboardFriendsIncomingModal'
import { DashboardLayoutPicker } from './DashboardLayoutPicker'
import type { ProfileSlugAvailability } from './DashboardProfileModal'
import { DashboardProfileModal } from './DashboardProfileModal'
import { PillToggle } from './PillToggle'
import { DashboardShell } from './DashboardShell'
import { ConfirmDialog } from './ConfirmDialog'
import { SettingsGearIcon } from './icons'

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

/** Время последней активности в личке (для тайла «Друзья»). */
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
    saving,
    searchPrivacySaving,
    uploadingAvatar,
    error,
    saveProfile,
    saveSearchPrivacy,
    uploadAvatar,
    removeAvatar,
    checkProfileSlugAvailable,
  } = useProfile()

  const [displayName, setDisplayName] = useState('')
  const [profileSlug, setProfileSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [nameEdited, setNameEdited] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [roomLayout, setRoomLayout] = useState<StoredLayoutMode>('pip')
  const [roomShowLayoutToggle, setRoomShowLayoutToggle] = useState(true)
  const [roomHideVideoLetterboxing, setRoomHideVideoLetterboxing] = useState(true)
  const [roomSaveMsg, setRoomSaveMsg] = useState<string | null>(null)
  const [roomSaveErr, setRoomSaveErr] = useState<string | null>(null)
  const [roomSaving, setRoomSaving] = useState(false)
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [searchClosed, setSearchClosed] = useState(true)
  const [allowSearchName, setAllowSearchName] = useState(true)
  const [allowSearchEmail, setAllowSearchEmail] = useState(false)
  const [allowSearchSlug, setAllowSearchSlug] = useState(true)
  const [searchPrivacyMsg, setSearchPrivacyMsg] = useState<string | null>(null)
  const [searchPrivacyErr, setSearchPrivacyErr] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [slugAvailability, setSlugAvailability] = useState<ProfileSlugAvailability>('idle')
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

  const refreshHiddenIncoming = useCallback(() => {
    if (!user?.id) {
      setHiddenIncomingIds([])
      return
    }
    setHiddenIncomingIds(readHiddenIncomingFavoriteIds(user.id))
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
    setSearchPrivacyMsg(null)
    setSearchPrivacyErr(null)
  }, [profile])

  useEffect(() => {
    if (!profileEditOpen || !profile) return
    setDisplayName(profile.display_name)
    setProfileSlug(profile.profile_slug ?? '')
    setSlugEdited(false)
    setNameEdited(false)
    setSaveMsg(null)
    setSaveErr(null)
  }, [profileEditOpen, profile])

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
  }, [user?.id])

  useEffect(() => {
    void listMessengerPeersByMessageCount(6).then((r) => {
      if (!r.error && r.data) setPeerTop(r.data)
      else setPeerTop([])
    })
  }, [user?.id, contactsTick])

  const currentName = nameEdited ? displayName : (profile?.display_name ?? '')
  const currentSlug = slugEdited ? profileSlug : (profile?.profile_slug ?? '')

  useEffect(() => {
    if (!profileEditOpen || !profile) {
      setSlugAvailability('idle')
      return
    }
    const raw = currentSlug.trim()
    if (!raw) {
      setSlugAvailability('free')
      return
    }
    const vErr = validateProfileSlugInput(raw)
    if (vErr) {
      setSlugAvailability('invalid')
      return
    }
    const normalized = normalizeProfileSlug(raw)
    if (normalized === (profile.profile_slug ?? '')) {
      setSlugAvailability('free')
      return
    }
    setSlugAvailability('checking')
    const t = window.setTimeout(() => {
      void checkProfileSlugAvailable(raw).then((ok) => {
        setSlugAvailability(ok ? 'free' : 'taken')
      })
    }, 380)
    return () => window.clearTimeout(t)
  }, [profileEditOpen, profile, currentSlug, checkProfileSlugAvailable])

  const handleNameChange = (value: string) => {
    setDisplayName(value)
    setNameEdited(true)
    setSaveMsg(null)
    setSaveErr(null)
  }

  const handleSlugChange = (value: string) => {
    setProfileSlug(value)
    setSlugEdited(true)
    setSaveMsg(null)
    setSaveErr(null)
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setSaveMsg(null)
    setSaveErr(null)
    const { error: err } = await saveProfile(currentName, currentSlug)
    if (err) setSaveErr(err)
    else {
      setSaveMsg('Сохранено')
      setSlugEdited(false)
      setNameEdited(false)
    }
  }

  const handleModalAvatarUpload = async (file: File) => {
    setSaveErr(null)
    const { error: err } = await uploadAvatar(file)
    if (err) setSaveErr(err)
  }

  const handleRemoveAvatar = async () => {
    setSaveErr(null)
    const { error: err } = await removeAvatar()
    if (err) setSaveErr(err)
  }

  const closeProfileModal = () => {
    setProfileEditOpen(false)
    setSaveMsg(null)
    setSaveErr(null)
  }

  const handleSaveSearchPrivacy = async (event: FormEvent) => {
    event.preventDefault()
    setSearchPrivacyErr(null)
    setSearchPrivacyMsg(null)
    const { error: err } = await saveSearchPrivacy({
      profile_search_closed: searchClosed,
      profile_search_allow_by_name: allowSearchName,
      profile_search_allow_by_email: allowSearchEmail,
      profile_search_allow_by_slug: allowSearchSlug,
    })
    if (err) setSearchPrivacyErr(err)
    else setSearchPrivacyMsg('Сохранено')
  }

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

  const hiddenIncomingSet = useMemo(() => new Set(hiddenIncomingIds), [hiddenIncomingIds])
  const incomingRequests = useMemo(
    () => contacts.filter((c) => c.favorsMe && !c.isFavorite),
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
      <DashboardFriendsIncomingModal
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

      <DashboardProfileModal
        open={profileEditOpen}
        onClose={closeProfileModal}
        displayName={currentName}
        onDisplayNameChange={handleNameChange}
        profileSlug={currentSlug}
        onProfileSlugChange={handleSlugChange}
        currentName={currentName}
        email={profile.email ?? ''}
        avatarUrl={profile.avatar_url}
        avatarAlt={profile.display_name}
        initials={initials}
        saving={saving}
        uploadingAvatar={uploadingAvatar}
        saveErr={saveErr}
        saveMsg={saveMsg}
        onSave={handleSave}
        onRemoveAvatar={() => {
          void handleRemoveAvatar()
        }}
        onUploadAvatar={(file) => {
          void handleModalAvatarUpload(file)
        }}
        searchOpen={searchOpen}
        onSearchOpenChange={(next) => {
          setSearchClosed(!next)
          setSearchPrivacyMsg(null)
          setSearchPrivacyErr(null)
        }}
        allowSearchName={allowSearchName}
        onAllowSearchNameChange={(v) => {
          setAllowSearchName(v)
          setSearchPrivacyMsg(null)
          setSearchPrivacyErr(null)
        }}
        allowSearchEmail={allowSearchEmail}
        onAllowSearchEmailChange={(v) => {
          setAllowSearchEmail(v)
          setSearchPrivacyMsg(null)
          setSearchPrivacyErr(null)
        }}
        allowSearchSlug={allowSearchSlug}
        onAllowSearchSlugChange={(v) => {
          setAllowSearchSlug(v)
          setSearchPrivacyMsg(null)
          setSearchPrivacyErr(null)
        }}
        searchPrivacySaving={searchPrivacySaving}
        searchPrivacyMsg={searchPrivacyMsg}
        searchPrivacyErr={searchPrivacyErr}
        onSaveSearchPrivacy={handleSaveSearchPrivacy}
        noSearchAxes={noSearchAxes}
        slugAvailability={slugAvailability}
        onDeleteAccountClick={() => {
          setDeleteErr(null)
          setDeleteConfirmOpen(true)
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Удалить аккаунт?"
        message={
          <>
            <p>
              Аккаунт и связанные данные будут удалены без возможности восстановления: комнаты, материалы, переписки и
              подписки в рамках этого профиля.
            </p>
            <p style={{ marginTop: '0.75rem' }}>Продолжить?</p>
          </>
        }
        confirmLabel="Удалить навсегда"
        cancelLabel="Отмена"
        confirmLoading={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteConfirmOpen(false)
        }}
        onConfirm={() => {
          void (async () => {
            setDeleteErr(null)
            setDeleteBusy(true)
            const res = await deleteMyAccount()
            setDeleteBusy(false)
            if (!res.ok) {
              setDeleteErr(res.error ?? 'Не удалось удалить аккаунт')
              return
            }
            setDeleteConfirmOpen(false)
            closeProfileModal()
            await signOut()
          })()
        }}
      />

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
                  onClick={() => setProfileEditOpen(true)}
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
          {deleteErr ? <p className="join-error dashboard-tile__foot-err">{deleteErr}</p> : null}
        </section>

        <section className="dashboard-tile dashboard-tile--rooms">
          <h2 className="dashboard-tile__title">Комнаты</h2>
          <div className="dashboard-tile__grow">
          {myRoomsLoading || roomArchiveLoading ? (
            <p className="dashboard-tile__hint">Загрузка…</p>
          ) : (
            <>
              <h3 className="dashboard-tile__subtitle">Постоянные</h3>
              {persistentPreview.length === 0 ? (
                <p className="dashboard-tile__hint">Пока нет постоянных комнат.</p>
              ) : (
                <ul className="dashboard-tile-rooms__list">
                  {persistentPreview.map((r) => (
                    <li key={r.slug} className="dashboard-tile-rooms__row">
                      <span className="dashboard-tile-rooms__dt">{formatRoomTileDate(r.createdAt)}</span>
                      <Link to={`/r/${encodeURIComponent(r.slug)}`} className="dashboard-tile-rooms__name">
                        {r.displayName?.trim() || r.slug}
                      </Link>
                      <span className="dashboard-tile-rooms__meta">—</span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="dashboard-tile__subtitle">Недавние</h3>
              {temporaryPreview.length === 0 ? (
                <p className="dashboard-tile__hint">Временных комнат в списке пока нет.</p>
              ) : (
                <ul className="dashboard-tile-rooms__list">
                  {temporaryPreview.map((it) => (
                    <li key={it.id} className="dashboard-tile-rooms__row">
                      <span className="dashboard-tile-rooms__dt">
                        {formatRoomTileDate(it.lastMessageAt ?? it.createdAt)}
                      </span>
                      <span className="dashboard-tile-rooms__name" title={it.title}>
                        {it.title}
                      </span>
                      <span className="dashboard-tile-rooms__meta">{it.messageCount} сообщ.</span>
                    </li>
                  ))}
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
          <h2 className="dashboard-tile__title">Друзья</h2>
          <div className="dashboard-tile-friends__head">
            <span className="dashboard-tile-friends__label">Запросы из избранного</span>
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
                return (
                  <button
                    key={p.userId}
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
                )
              })
            )}
          </div>
          <Link to="/dashboard/friends" className="dashboard-tile__more">
            Подробнее — все друзья
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
