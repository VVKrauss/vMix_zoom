import { useEffect, useRef } from 'react'

export function MessengerBookmarkScopeDialog({
  open,
  busy,
  onClose,
  onPickMe,
  onPickAll,
}: {
  open: boolean
  busy?: boolean
  onClose: () => void
  onPickMe: () => void
  onPickAll: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      const btn = ref.current?.querySelector<HTMLButtonElement>('button[data-autofocus="true"]')
      btn?.focus()
    }, 0)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  return (
    <div className="confirm-dialog-root" role="dialog" aria-modal="true" aria-label="Добавить в закладки">
      <button type="button" className="confirm-dialog-backdrop" onClick={() => (!busy ? onClose() : null)} aria-label="Закрыть" />
      <div className="confirm-dialog" ref={ref}>
        <div className="confirm-dialog__title">Добавить в закладки</div>
        <div className="confirm-dialog__body">Сделать закладку видимой для обоих в ЛС или только для вас?</div>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--primary"
            data-autofocus="true"
            disabled={busy}
            onClick={onPickMe}
          >
            Только мне
          </button>
          <button type="button" className="confirm-dialog__btn" disabled={busy} onClick={onPickAll}>
            Для обоих
          </button>
          <button type="button" className="confirm-dialog__btn" disabled={busy} onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

