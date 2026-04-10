import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCanAccessAdminPanel } from '../hooks/useCanAccessAdminPanel'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'
import { newRoomId } from '../utils/roomId'
import { setPendingHostClaim } from '../lib/spaceRoom'
import { DashboardProfileModal } from './DashboardProfileModal'
import { DashboardLayoutPicker } from './DashboardLayoutPicker'
import { PillToggle } from './PillToggle'

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

export function DashboardPage() {
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { allowed: canAccessAdmin } = useCanAccessAdminPanel()
  const { profile, plan, loading, saving, uploadingAvatar, error, saveProfile, uploadAvatar, removeAvatar } =
    useProfile()

  const [displayName, setDisplayName] = useState('')
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

  useEffect(() => {
    if (!profile) return
    const m = mergeRoomUiPrefs(profile.room_ui_preferences)
    setRoomLayout(m.layout_mode)
    setRoomShowLayoutToggle(m.show_layout_toggle)
    setRoomHideVideoLetterboxing(m.hide_video_letterboxing)
  }, [profile])

  useEffect(() => {
    if (!profileEditOpen || !profile) return
    setDisplayName(profile.display_name)
    setNameEdited(false)
    setSaveMsg(null)
    setSaveErr(null)
  }, [profileEditOpen, profile])

  const currentName = nameEdited ? displayName : (profile?.display_name ?? '')

  const handleNameChange = (v: string) => {
    setDisplayName(v)
    setNameEdited(true)
    setSaveMsg(null)
    setSaveErr(null)
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaveMsg(null)
    setSaveErr(null)
    const { error: err } = await saveProfile(currentName)
    if (err) setSaveErr(err)
    else setSaveMsg('Сохранено')
  }

  const handleModalAvatarUpload = async (file: File) => {
    setSaveErr(null)
    const { error: err } = await uploadAvatar(file)
    if (err) setSaveErr(err)
  }

  const goCreateRoom = () => {
    const id = newRoomId()
    setPendingHostClaim(id)
    navigate(`/r/${encodeURIComponent(id)}`)
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

  const handleSaveRoomPrefs = async (e: FormEvent) => {
    e.preventDefault()
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
    const m = mergeRoomUiPrefs(data?.room_ui_preferences)
    const next = {
      layout_mode: roomLayout,
      show_layout_toggle: roomShowLayoutToggle,
      hide_video_letterboxing: roomHideVideoLetterboxing,
      ...(m.pip ? { pip: { pos: m.pip.pos, size: m.pip.size } } : {}),
    }
    const { error: upErr } = await supabase
      .from('users')
      .update({ room_ui_preferences: next, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    setRoomSaving(false)
    if (upErr) setRoomSaveErr(upErr.message)
    else setRoomSaveMsg('Сохранено')
  }

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-topbar">
          <Link to="/" className="dashboard-topbar__logo">
            <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
          </Link>
        </div>
        <div className="dashboard-body">
          <div className="auth-loading" aria-label="Загрузка…" />
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-topbar">
          <Link to="/" className="dashboard-topbar__logo">
            <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
          </Link>
        </div>
        <div className="dashboard-body">
          <p className="join-error">{error ?? 'Не удалось загрузить профиль'}</p>
        </div>
      </div>
    )
  }

  const initials = profile.display_name.charAt(0).toUpperCase()

  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <Link to="/" className="dashboard-topbar__logo" title="На главную">
          <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>
        <nav className="dashboard-topbar__nav">
          <Link to="/" className="dashboard-topbar__nav-link">
            На главную
          </Link>
          <button
            type="button"
            className="dashboard-topbar__nav-link dashboard-topbar__nav-link--btn"
            onClick={goCreateRoom}
          >
            Создать комнату
          </button>
          {canAccessAdmin ? (
            <Link to="/admin" className="dashboard-topbar__nav-link">
              Админка
            </Link>
          ) : null}
          <button
            type="button"
            className="dashboard-topbar__nav-link dashboard-topbar__nav-link--btn"
            onClick={() => signOut()}
          >
            Выйти
          </button>
        </nav>
      </header>

      <div className="dashboard-body">
        <div className="dashboard-content dashboard-content--cabinet">
          <DashboardProfileModal
            open={profileEditOpen}
            onClose={closeProfileModal}
            displayName={currentName}
            onDisplayNameChange={handleNameChange}
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
          />

          <div className="dashboard-profile-account-row">
            <section className="dashboard-section">
              <h2 className="dashboard-section__title">Профиль</h2>
              <div className="dashboard-profile-summary">
                <div className="dashboard-profile-summary__avatar">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.display_name} />
                  ) : (
                    <span className="dashboard-profile-summary__initials">{initials}</span>
                  )}
                </div>
                <div className="dashboard-profile-summary__text">
                  <span className="dashboard-profile-summary__name">{profile.display_name}</span>
                  <span className="dashboard-profile-summary__email" title={profile.email ?? undefined}>
                    {profile.email ?? '—'}
                  </span>
                </div>
                <button
                  type="button"
                  className="dashboard-profile-summary__edit"
                  onClick={() => setProfileEditOpen(true)}
                >
                  Изменить
                </button>
              </div>
            </section>

            <section className="dashboard-section">
              <h2 className="dashboard-section__title">Аккаунт</h2>

              <div className="dashboard-meta-grid">
                <div className="dashboard-meta-item">
                  <span className="dashboard-meta-item__label">Статус</span>
                  <span className={`dashboard-badge ${STATUS_CLASS[profile.status] ?? ''}`}>
                    {STATUS_LABEL[profile.status] ?? profile.status}
                  </span>
                </div>

                <div className="dashboard-meta-item dashboard-meta-item--roles">
                  <span className="dashboard-meta-item__label">Роли на платформе</span>
                  {profile.global_roles.length > 0 ? (
                    <div className="dashboard-role-badges">
                      {profile.global_roles.map((r) => (
                        <span
                          key={r.code}
                          className={globalRoleBadgeClass(r.code)}
                          title={r.title ? `${r.title} (${r.code})` : r.code}
                        >
                          {GLOBAL_ROLE_LABEL[r.code] ?? r.title ?? r.code}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="dashboard-meta-item__empty">Стандартный доступ</span>
                  )}
                </div>

                <div className="dashboard-meta-item">
                  <span className="dashboard-meta-item__label">Тарифный план</span>
                  <div className="dashboard-plan">
                    <span className="dashboard-plan__name">{plan?.plan_name ?? 'Free'}</span>
                    {plan?.sub_status && (
                      <span className="dashboard-badge dashboard-badge--active">{plan.sub_status}</span>
                    )}
                    {plan?.trial_ends_at && (
                      <span className="dashboard-plan__trial">
                        Пробный до {new Date(plan.trial_ends_at).toLocaleDateString('ru-RU')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="dashboard-section">
            <h2 className="dashboard-section__title">Настройки комнаты</h2>
            <p className="dashboard-section__hint">
              Для входа с компьютера: вид по умолчанию, кнопка смены раскладки и отображение камеры в
              плитках. На телефоне по-прежнему своя сетка и жесты.
            </p>
            <form onSubmit={handleSaveRoomPrefs} className="dashboard-form">
              <div className="dashboard-field">
                <div className="dashboard-field__inline dashboard-field__inline--stripe">
                  <span className="dashboard-field__label">Вид по умолчанию</span>
                  <DashboardLayoutPicker value={roomLayout} onChange={setRoomLayout} />
                </div>
              </div>
              <div className="dashboard-field">
                <div className="dashboard-field__inline dashboard-field__inline--toggle dashboard-field__inline--stripe">
                  <span className="dashboard-field__label">Кнопка смены вида в комнате</span>
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
                <div className="dashboard-field__inline dashboard-field__inline--toggle dashboard-field__inline--stripe">
                  <span className="dashboard-field__label">Скрывать поля у камеры</span>
                  <PillToggle
                    checked={roomHideVideoLetterboxing}
                    onCheckedChange={setRoomHideVideoLetterboxing}
                    offLabel="Нет"
                    onLabel="Да"
                    ariaLabel="Обрезать видео камеры под плитку без чёрных полей; выкл — весь кадр вписан в плитку"
                  />
                </div>
              </div>
              {roomSaveErr && <p className="join-error">{roomSaveErr}</p>}
              {roomSaveMsg && <p className="dashboard-save-ok">{roomSaveMsg}</p>}
              <button type="submit" className="join-btn dashboard-form__save" disabled={roomSaving}>
                {roomSaving ? 'Сохранение…' : 'Сохранить настройки комнаты'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}
