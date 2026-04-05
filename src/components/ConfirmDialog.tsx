import { useEffect } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Выйти',
  cancelLabel = 'Отмена',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="confirm-dialog-root">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Закрыть"
        onClick={onCancel}
      />
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <h2 id="confirm-dialog-title" className="confirm-dialog__title">
          {title}
        </h2>
        <p className="confirm-dialog__msg">{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
