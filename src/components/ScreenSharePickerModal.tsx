import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type Surface = 'monitor' | 'window' | 'browser'

interface Props {
  onClose: () => void
  onPickSurface: (surface: Surface) => void
}

export function ScreenSharePickerModal({ onClose, onPickSurface }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const pick = (surface: Surface) => {
    onPickSurface(surface)
  }

  const node = (
    <div className="screen-share-modal-root" role="presentation">
      <button
        type="button"
        className="screen-share-modal-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="screen-share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-share-modal-title"
        tabIndex={-1}
      >
        <div className="screen-share-modal__head">
          <h2 id="screen-share-modal-title" className="screen-share-modal__title">
            Демонстрация экрана
          </h2>
        </div>

        <div className="screen-share-modal__grid">
          <button
            type="button"
            className="screen-share-modal__card"
            onClick={() => pick('monitor')}
          >
            <span className="screen-share-modal__card-icon" aria-hidden>
              <IconMonitor />
            </span>
            <span className="screen-share-modal__card-title">Весь экран</span>
            <span className="screen-share-modal__card-desc">Монитор целиком</span>
          </button>
          <button
            type="button"
            className="screen-share-modal__card"
            onClick={() => pick('window')}
          >
            <span className="screen-share-modal__card-icon" aria-hidden>
              <IconWindow />
            </span>
            <span className="screen-share-modal__card-title">Окно</span>
            <span className="screen-share-modal__card-desc">Приложение на рабочем столе</span>
          </button>
          <button
            type="button"
            className="screen-share-modal__card"
            onClick={() => pick('browser')}
          >
            <span className="screen-share-modal__card-icon" aria-hidden>
              <IconTab />
            </span>
            <span className="screen-share-modal__card-title">Вкладка</span>
            <span className="screen-share-modal__card-desc">Содержимое вкладки Chrome</span>
          </button>
        </div>

        <div className="screen-share-modal__footer">
          <button type="button" className="screen-share-modal__cancel" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}

function IconMonitor() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="6" y="8" width="36" height="26" rx="3" />
      <path d="M16 38h16M24 34v4" strokeLinecap="round" />
    </svg>
  )
}

function IconWindow() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="8" y="12" width="32" height="28" rx="2" />
      <path d="M8 18h32" />
      <circle cx="14" cy="15" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconTab() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M6 14h36v22a3 3 0 01-3 3H9a3 3 0 01-3-3V14z" />
      <path d="M6 14V11a3 3 0 013-3h30a3 3 0 013 3v3" />
      <path d="M18 22h16M18 28h10" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
