import { FiRrIcon } from './icons'

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Полноэкранный режим «Диван» (совместный просмотр). Контент дорабатывается отдельно.
 */
export function CouchModeWorkspace({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div
      className="couch-mode-workspace"
      role="dialog"
      aria-modal="true"
      aria-labelledby="couch-mode-workspace-title"
    >
      <header className="couch-mode-workspace__header">
        <h1 id="couch-mode-workspace-title" className="couch-mode-workspace__title">
          <FiRrIcon name="sofa" className="couch-mode-workspace__title-fi" aria-hidden />
          Диван
        </h1>
        <button
          type="button"
          className="couch-mode-workspace__close"
          onClick={onClose}
        >
          Закрыть
        </button>
      </header>
      <div className="couch-mode-workspace__body">
        <p className="couch-mode-workspace__hint">
          Режим совместного просмотра: демонстрация экрана со звуком вкладки для гостей.
        </p>
      </div>
    </div>
  )
}
