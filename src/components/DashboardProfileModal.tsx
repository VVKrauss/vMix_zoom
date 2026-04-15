import type { FormEvent } from 'react'
import { useEffect, useRef } from 'react'
import { PillToggle } from './PillToggle'
import { ThemeToggle } from './ThemeToggle'

export type ProfileSlugAvailability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid'

export interface DashboardProfileModalProps {
  open: boolean
  onClose: () => void
  displayName: string
  onDisplayNameChange: (v: string) => void
  profileSlug: string
  onProfileSlugChange: (v: string) => void
  currentName: string
  email: string
  avatarUrl: string | null
  avatarAlt: string
  initials: string
  saving: boolean
  uploadingAvatar: boolean
  saveErr: string | null
  saveMsg: string | null
  onSave: (e: FormEvent) => void
  onRemoveAvatar: () => void
  onUploadAvatar: (file: File) => void
  /** Поиск профиля */
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
  allowSearchName: boolean
  onAllowSearchNameChange: (v: boolean) => void
  allowSearchEmail: boolean
  onAllowSearchEmailChange: (v: boolean) => void
  allowSearchSlug: boolean
  onAllowSearchSlugChange: (v: boolean) => void
  searchPrivacySaving: boolean
  searchPrivacyMsg: string | null
  searchPrivacyErr: string | null
  onSaveSearchPrivacy: (e: FormEvent) => void
  noSearchAxes: boolean
  slugAvailability: ProfileSlugAvailability
  onDeleteAccountClick: () => void
}

export function DashboardProfileModal({
  open,
  onClose,
  displayName,
  onDisplayNameChange,
  profileSlug,
  onProfileSlugChange,
  currentName,
  email,
  avatarUrl,
  avatarAlt,
  initials,
  saving,
  uploadingAvatar,
  saveErr,
  saveMsg,
  onSave,
  onRemoveAvatar,
  onUploadAvatar,
  searchOpen,
  onSearchOpenChange,
  allowSearchName,
  onAllowSearchNameChange,
  allowSearchEmail,
  onAllowSearchEmailChange,
  allowSearchSlug,
  onAllowSearchSlugChange,
  searchPrivacySaving,
  searchPrivacyMsg,
  searchPrivacyErr,
  onSaveSearchPrivacy,
  noSearchAxes,
  slugAvailability,
  onDeleteAccountClick,
}: DashboardProfileModalProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onUploadAvatar(file)
  }

  const slugHint = () => {
    if (slugAvailability === 'checking') return 'Проверка…'
    if (slugAvailability === 'invalid') return 'Исправьте формат ника'
    if (slugAvailability === 'taken') return 'Это имя пользователя уже занято'
    if (slugAvailability === 'free') return 'Имя пользователя свободно'
    return 'Латиница, цифры и дефис, 3–32 символа. По нему вас можно найти в поиске.'
  }

  return (
    <div className="confirm-dialog-root">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="confirm-dialog dashboard-profile-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-profile-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dashboard-profile-modal-title" className="confirm-dialog__title">
          Настройки профиля
        </h2>

        <div className="dashboard-profile-modal__scroll">
          <div className="dashboard-avatar-row">
            <button
              type="button"
              className="dashboard-avatar"
              onClick={() => fileRef.current?.click()}
              title="Загрузить фото"
              disabled={uploadingAvatar}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt={avatarAlt} className="dashboard-avatar__img" />
              ) : (
                <span className="dashboard-avatar__initials">{initials}</span>
              )}
              <span className="dashboard-avatar__overlay">{uploadingAvatar ? '…' : '📷'}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="dashboard-avatar__file"
              onChange={onFileChange}
            />
            <div className="dashboard-avatar-info">
              <p className="dashboard-avatar-info__hint">JPG, PNG, WebP · до 2 МБ</p>
              {avatarUrl ? (
                <button
                  type="button"
                  className="dashboard-avatar-info__remove"
                  onClick={onRemoveAvatar}
                  disabled={uploadingAvatar}
                >
                  Удалить фото
                </button>
              ) : null}
            </div>
          </div>

          <form id="dashboard-profile-form" onSubmit={onSave} className="dashboard-form">
            <div className="dashboard-field">
              <label className="dashboard-field__label" htmlFor="dashboard-profile-name">
                Отображаемое имя
              </label>
              <input
                id="dashboard-profile-name"
                className="join-input"
                type="text"
                value={displayName}
                onChange={(e) => onDisplayNameChange(e.target.value)}
                maxLength={40}
                required
              />
            </div>
            <div className="dashboard-field">
              <label className="dashboard-field__label" htmlFor="dashboard-profile-slug">
                Имя пользователя
              </label>
              <input
                id="dashboard-profile-slug"
                className="join-input"
                type="text"
                value={profileSlug}
                onChange={(e) => onProfileSlugChange(e.target.value)}
                maxLength={32}
                placeholder="например, ivan-stream"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <p
                className={`dashboard-field__hint${
                  slugAvailability === 'taken' || slugAvailability === 'invalid' ? ' join-error' : ''
                }`}
              >
                {slugHint()}
              </p>
            </div>
            <div className="dashboard-field">
              <label className="dashboard-field__label" htmlFor="dashboard-profile-email">
                Email
              </label>
              <input
                id="dashboard-profile-email"
                className="join-input join-input--readonly"
                type="email"
                value={email}
                readOnly
                aria-readonly="true"
              />
            </div>
            {saveErr ? <p className="join-error">{saveErr}</p> : null}
            {saveMsg ? <p className="dashboard-save-ok">{saveMsg}</p> : null}
          </form>

          <div className="dashboard-field dashboard-field--modal-divider">
            <div className="dashboard-field__inline dashboard-field__inline--toggle">
              <span className="dashboard-field__label">Тема оформления</span>
              <ThemeToggle variant="inline" className="theme-toggle--dashboard" />
            </div>
          </div>

          <form onSubmit={onSaveSearchPrivacy} className="dashboard-form">
            <h3 className="dashboard-profile-modal__subtitle">Поиск профиля на платформе</h3>
            <p className="dashboard-field__hint">
              Другие пользователи могут находить вас в разделе «Контакты» только если вы разрешите это явно.
            </p>
            <div className="dashboard-field">
              <div className="dashboard-field__inline dashboard-field__inline--toggle">
                <span className="dashboard-field__label">Открытый профиль</span>
                <PillToggle
                  checked={searchOpen}
                  onCheckedChange={onSearchOpenChange}
                  ariaLabel="Открытый профиль: участие в глобальном поиске"
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
                    onCheckedChange={onAllowSearchNameChange}
                    offLabel="Нет"
                    onLabel="Да"
                    ariaLabel="Поиск по имени"
                    disabled={!searchOpen}
                  />
                </div>
                <div className="dashboard-field__inline dashboard-field__inline--toggle">
                  <span className="dashboard-field__sublabel">Электронной почте</span>
                  <PillToggle
                    compact
                    checked={allowSearchEmail}
                    onCheckedChange={onAllowSearchEmailChange}
                    offLabel="Нет"
                    onLabel="Да"
                    ariaLabel="Поиск по email"
                    disabled={!searchOpen}
                  />
                </div>
                <div className="dashboard-field__inline dashboard-field__inline--toggle">
                  <span className="dashboard-field__sublabel">Имени пользователя (@ник)</span>
                  <PillToggle
                    compact
                    checked={allowSearchSlug}
                    onCheckedChange={onAllowSearchSlugChange}
                    offLabel="Нет"
                    onLabel="Да"
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
            {searchPrivacyMsg ? <p className="dashboard-save-ok">{searchPrivacyMsg}</p> : null}
            <button type="submit" className="join-btn dashboard-form__save" disabled={searchPrivacySaving}>
              {searchPrivacySaving ? 'Сохранение…' : 'Сохранить настройки поиска'}
            </button>
          </form>

          <div className="dashboard-field dashboard-field--danger-zone">
            <span className="dashboard-field__label">Опасная зона</span>
            <p className="dashboard-meta-item__hint">
              Удаление аккаунта необратимо: восстановить доступ к материалам и перепискам будет нельзя.
            </p>
            <button type="button" className="dashboard-account-delete" onClick={onDeleteAccountClick}>
              Удалить аккаунт…
            </button>
          </div>
        </div>

        <div className="dashboard-profile-modal__foot">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="submit"
            form="dashboard-profile-form"
            className="confirm-dialog__btn confirm-dialog__btn--primary"
            disabled={
              saving ||
              !currentName.trim() ||
              slugAvailability === 'checking' ||
              slugAvailability === 'taken' ||
              slugAvailability === 'invalid'
            }
          >
            {saving ? 'Сохранение…' : 'Сохранить профиль'}
          </button>
        </div>
      </div>
    </div>
  )
}
