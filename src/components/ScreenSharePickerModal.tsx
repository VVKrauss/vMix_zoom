import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ScreenShareGlyphMonitor, ScreenShareGlyphTab, ScreenShareGlyphWindow } from './ScreenShareSurfaceGlyphs'

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
              <ScreenShareGlyphMonitor />
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
              <ScreenShareGlyphWindow />
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
              <ScreenShareGlyphTab />
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
