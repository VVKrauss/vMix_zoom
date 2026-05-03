import { useEffect, type ReactNode } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Блокирует кнопку подтверждения (например, во время запроса). */
  confirmLoading?: boolean
  /** Дополнительное действие между «Отмена» и основной кнопкой (например, опасная операция). */
  extraAction?: { label: string; onClick: () => void; danger?: boolean }
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Выйти',
  cancelLabel = 'Отмена',
  confirmLoading = false,
  extraAction,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!confirmLoading) onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, confirmLoading])

  if (!open) return null

  return (
    <div className="confirm-dialog-root">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Закрыть"
        onClick={() => {
          if (!confirmLoading) onCancel()
        }}
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
        <div className="confirm-dialog__msg">{message}</div>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--secondary"
            disabled={confirmLoading}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          {extraAction ? (
            <button
              type="button"
              className={`confirm-dialog__btn${
                extraAction.danger ? ' confirm-dialog__btn--danger' : ' confirm-dialog__btn--secondary'
              }`}
              disabled={confirmLoading}
              onClick={() => {
                if (!confirmLoading) extraAction.onClick()
              }}
            >
              {extraAction.label}
            </button>
          ) : null}
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--primary"
            disabled={confirmLoading}
            onClick={onConfirm}
          >
            {confirmLoading ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
