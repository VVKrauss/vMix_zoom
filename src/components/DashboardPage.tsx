import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import type { StoredLayoutMode } from '../config/roomUiStorage'
import { mergeRoomUiPrefs } from '../types/roomUiPreferences'

const STATUS_LABEL: Record<string, string> = {
  active:  'Активен',
  blocked: 'Заблокирован',
  pending: 'Ожидает подтверждения',
  deleted: 'Удалён',
}

const STATUS_CLASS: Record<string, string> = {
  active:  'dashboard-badge--active',
  blocked: 'dashboard-badge--blocked',
  pending: 'dashboard-badge--pending',
  deleted: 'dashboard-badge--deleted',
}

const LAYOUT_OPTIONS: { value: StoredLayoutMode; label: string }[] = [
  { value: 'pip', label: 'Картинка в картинке' },
  { value: 'grid', label: 'Плитки' },
  { value: 'meet', label: 'Лента (Meet)' },
  { value: 'speaker', label: 'Спикер' },
]

export function DashboardPage() {
  const { signOut, user } = useAuth()
  const { profile, plan, loading, saving, uploadingAvatar, error, saveProfile, uploadAvatar, removeAvatar } = useProfile()

  const [displayName, setDisplayName] = useState('')
  const [nameEdited, setNameEdited]   = useState(false)
  const [saveMsg, setSaveMsg]         = useState<string | null>(null)
  const [saveErr, setSaveErr]         = useState<string | null>(null)
  const [roomLayout, setRoomLayout]   = useState<StoredLayoutMode>('pip')
  const [roomShowLayoutToggle, setRoomShowLayoutToggle] = useState(true)
  const [roomSaveMsg, setRoomSaveMsg] = useState<string | null>(null)
  const [roomSaveErr, setRoomSaveErr] = useState<string | null>(null)
  const [roomSaving, setRoomSaving]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile) return
    const m = mergeRoomUiPrefs(profile.room_ui_preferences)
    setRoomLayout(m.layout_mode)
    setRoomShowLayoutToggle(m.show_layout_toggle)
  }, [profile])

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
    if (err) { setSaveErr(err) } else { setSaveMsg('Сохранено') }
  }

  const handleAvatarClick = () => fileRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSaveErr(null)
    const { error: err } = await uploadAvatar(file)
    if (err) setSaveErr(err)
  }

  const handleRemoveAvatar = async () => {
    setSaveErr(null)
    const { error: err } = await removeAvatar()
    if (err) setSaveErr(err)
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

      {/* Топбар */}
      <header className="dashboard-topbar">
        <Link to="/" className="dashboard-topbar__logo" title="На главную">
          <img className="brand-logo brand-logo--header-h" src="/logo-h.png" alt="" draggable={false} />
        </Link>
        <nav className="dashboard-topbar__nav">
          <Link to="/" className="dashboard-topbar__nav-link">На главную</Link>
          <button type="button" className="dashboard-topbar__nav-link dashboard-topbar__nav-link--btn" onClick={() => signOut()}>
            Выйти
          </button>
        </nav>
      </header>

      <div className="dashboard-body">
        <div className="dashboard-content">

          {/* ── Профиль ── */}
          <section className="dashboard-section">
            <h2 className="dashboard-section__title">Профиль</h2>

            {/* Аватар */}
            <div className="dashboard-avatar-row">
              <button
                type="button"
                className="dashboard-avatar"
                onClick={handleAvatarClick}
                title="Загрузить фото"
                disabled={uploadingAvatar}
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.display_name} className="dashboard-avatar__img" />
                ) : (
                  <span className="dashboard-avatar__initials">{initials}</span>
                )}
                <span className="dashboard-avatar__overlay">
                  {uploadingAvatar ? '…' : '📷'}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="dashboard-avatar__file"
                onChange={handleFileChange}
              />
              <div className="dashboard-avatar-info">
                <p className="dashboard-avatar-info__hint">JPG, PNG, WebP · до 2 МБ</p>
                {profile.avatar_url && (
                  <button
                    type="button"
                    className="dashboard-avatar-info__remove"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar}
                  >
                    Удалить фото
                  </button>
                )}
              </div>
            </div>

            {/* Форма */}
            <form onSubmit={handleSave} className="dashboard-form">
              <div className="dashboard-field">
                <label className="dashboard-field__label">Отображаемое имя</label>
                <input
                  className="join-input"
                  type="text"
                  value={currentName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  maxLength={40}
                  required
                />
              </div>

              <div className="dashboard-field">
                <label className="dashboard-field__label">Email</label>
                <input
                  className="join-input join-input--readonly"
                  type="email"
                  value={profile.email ?? ''}
                  readOnly
                  aria-readonly="true"
                />
              </div>

              {saveErr && <p className="join-error">{saveErr}</p>}
              {saveMsg && <p className="dashboard-save-ok">{saveMsg}</p>}

              <button
                type="submit"
                className="join-btn dashboard-form__save"
                disabled={saving || !currentName.trim()}
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </form>
          </section>

          {/* ── Комнаты (десктоп) ── */}
          <section className="dashboard-section">
            <h2 className="dashboard-section__title">Настройки комнаты</h2>
            <p className="dashboard-section__hint">
              Для входа с компьютера: вид по умолчанию и кнопка смены раскладки. На телефоне по-прежнему своя сетка и жесты.
            </p>
            <form onSubmit={handleSaveRoomPrefs} className="dashboard-form">
              <div className="dashboard-field">
                <span className="dashboard-field__label">Вид по умолчанию</span>
                <div className="dashboard-layout-options">
                  {LAYOUT_OPTIONS.map((o) => (
                    <label key={o.value} className="dashboard-layout-option">
                      <input
                        type="radio"
                        name="room_layout"
                        value={o.value}
                        checked={roomLayout === o.value}
                        onChange={() => setRoomLayout(o.value)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="dashboard-field dashboard-field--checkbox">
                <input
                  type="checkbox"
                  checked={roomShowLayoutToggle}
                  onChange={(e) => setRoomShowLayoutToggle(e.target.checked)}
                />
                <span>Показывать круглую кнопку смены вида в комнате</span>
              </label>
              {roomSaveErr && <p className="join-error">{roomSaveErr}</p>}
              {roomSaveMsg && <p className="dashboard-save-ok">{roomSaveMsg}</p>}
              <button type="submit" className="join-btn dashboard-form__save" disabled={roomSaving}>
                {roomSaving ? 'Сохранение…' : 'Сохранить настройки комнаты'}
              </button>
            </form>
          </section>

          {/* ── Аккаунт ── */}
          <section className="dashboard-section">
            <h2 className="dashboard-section__title">Аккаунт</h2>

            <div className="dashboard-meta-grid">
              <div className="dashboard-meta-item">
                <span className="dashboard-meta-item__label">Статус</span>
                <span className={`dashboard-badge ${STATUS_CLASS[profile.status] ?? ''}`}>
                  {STATUS_LABEL[profile.status] ?? profile.status}
                </span>
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
      </div>
    </div>
  )
}
