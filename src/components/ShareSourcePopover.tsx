import { useRef } from 'react'
import { useOnOutsideClick } from '../hooks/useOnOutsideClick'
import { ScreenShareGlyphMonitor, ScreenShareGlyphTab, ScreenShareGlyphWindow } from './ScreenShareSurfaceGlyphs'

export type ShareSurface = 'monitor' | 'window' | 'browser'

export function ShareSourcePopover({
  isSharing,
  onClose,
  onPick,
  onStop,
}: {
  isSharing: boolean
  onClose: () => void
  onPick: (surface: ShareSurface) => void
  onStop: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useOnOutsideClick(ref, onClose)

  return (
    <div className="device-popover device-popover--share-source" ref={ref}>
      <div className="device-popover__title">{isSharing ? 'Демонстрация' : 'Что показать'}</div>
      {isSharing ? (
        <button type="button" className="device-popover__item" onClick={onStop}>
          Остановить демонстрацию
        </button>
      ) : (
        <>
          <button type="button" className="device-popover__item" onClick={() => onPick('monitor')}>
            <span className="screen-share-source-popover__icon" aria-hidden>
              <ScreenShareGlyphMonitor />
            </span>
            Весь экран
          </button>
          <button type="button" className="device-popover__item" onClick={() => onPick('window')}>
            <span className="screen-share-source-popover__icon" aria-hidden>
              <ScreenShareGlyphWindow />
            </span>
            Окно приложения
          </button>
          <button type="button" className="device-popover__item" onClick={() => onPick('browser')}>
            <span className="screen-share-source-popover__icon" aria-hidden>
              <ScreenShareGlyphTab />
            </span>
            Вкладка браузера
          </button>
        </>
      )}
    </div>
  )
}

