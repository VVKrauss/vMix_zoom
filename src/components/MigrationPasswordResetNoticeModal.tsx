import { useEffect } from 'react'

export type MigrationPasswordResetNoticeModalProps = {
  open: boolean
  onClose: () => void
}

export function MigrationPasswordResetNoticeModal({ open, onClose }: MigrationPasswordResetNoticeModalProps) {
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

  return (
    <div className="confirm-dialog-root" role="dialog" aria-modal="true" aria-label="Важно: переезд базы данных">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="confirm-dialog">
        <div className="confirm-dialog__title">Важно</div>
        <div className="confirm-dialog__desc" style={{ textAlign: 'left' }}>
          Мы переехали на новую базу данных.
          <br />
          <br />
          Если у вас уже была учётная запись, пожалуйста, <b>сбросьте пароль</b> и установите новый.
          <br />
          <br />
          Если вход не работает — используйте «Забыли пароль».
        </div>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--primary" onClick={onClose}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}

