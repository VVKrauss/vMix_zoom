import { FormEvent, useEffect, useRef } from 'react'

export interface DashboardProfileModalProps {
  open: boolean
  onClose: () => void
  displayName: string
  onDisplayNameChange: (v: string) => void
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
}

export function DashboardProfileModal({
  open,
  onClose,
  displayName,
  onDisplayNameChange,
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
          Редактирование профиля
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
        </div>

        <div className="dashboard-profile-modal__foot">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" onClick={onClose}>
            Закрыть
          </button>
          <button
            type="submit"
            form="dashboard-profile-form"
            className="confirm-dialog__btn confirm-dialog__btn--primary"
            disabled={saving || !currentName.trim()}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
