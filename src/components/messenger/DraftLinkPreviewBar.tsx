import type { LinkPreview } from '../../lib/linkPreview'
import { MessengerLinkPreviewCard } from './MessengerLinkPreviewCard'

export function DraftLinkPreviewBar({
  preview,
  loading,
  onDismiss,
}: {
  preview: LinkPreview | null
  loading: boolean
  onDismiss: () => void
}) {
  if (!loading && !preview) return null
  return (
    <div className="dashboard-messenger__draft-link-preview">
      {loading && !preview ? (
        <div className="dashboard-messenger__draft-link-preview-loading" aria-live="polite">
          Ссылка…
        </div>
      ) : preview ? (
        <>
          <MessengerLinkPreviewCard link={preview} />
          <button
            type="button"
            className="dashboard-messenger__draft-link-preview-dismiss"
            aria-label="Не прикреплять превью"
            onClick={onDismiss}
          >
            ✕
          </button>
        </>
      ) : null}
    </div>
  )
}
