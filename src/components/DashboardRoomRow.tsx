import { Link } from 'react-router-dom'
import { CamIcon } from './icons'

/** Одна строка комнаты: тайл кабинета и вкладка «Комнаты» — одинаковая вёрстка, отличается только набором данных снаружи. */
export function DashboardRoomRow({
  dateLabel,
  title,
  titleHint,
  avatarUrl,
  meta,
  isOpen,
  showCamLink,
  camHref,
  onOpenStats,
}: {
  dateLabel: string
  title: string
  titleHint?: string
  avatarUrl?: string | null
  /** Подпись справа от названия (доступ/чат или число сообщений); можно не передавать. */
  meta?: string
  isOpen: boolean
  /** Показывать переход в эфир только если комната сейчас открыта и есть ссылка */
  showCamLink?: boolean
  camHref?: string
  onOpenStats: () => void
}) {
  return (
    <div className="dashboard-rooms-compact-row dashboard-rooms-compact-row--clickable">
      <button
        type="button"
        className="dashboard-rooms-compact-row__main-hit"
        onClick={onOpenStats}
        title="Статистика комнаты"
      >
        <span className="dashboard-rooms-compact-row__hit-inner">
          {isOpen ? (
            <span className="dashboard-rooms-live-dot" title="Открыта" aria-label="Открыта" />
          ) : (
            <span className="dashboard-rooms-live-slot" aria-hidden />
          )}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="dashboard-my-rooms__avatar"
              width={24}
              height={24}
              loading="lazy"
              decoding="async"
            />
          ) : null}
          <span className="dashboard-rooms-compact-row__title" title={titleHint ?? title}>
            {title}
          </span>
          <span className="dashboard-rooms-compact-row__date">{dateLabel}</span>
        </span>
      </button>
      {meta ? (
        <span className="dashboard-my-rooms__meta dashboard-rooms-compact-meta" title={meta}>
          {meta}
        </span>
      ) : null}
      {showCamLink && camHref ? (
        <div className="dashboard-rooms-compact-row__actions">
          <Link
            to={camHref}
            className="dashboard-rooms-icon-btn dashboard-my-rooms__open"
            title="Открыть комнату"
            aria-label="Открыть комнату"
            onClick={(e) => e.stopPropagation()}
          >
            <CamIcon />
          </Link>
        </div>
      ) : null}
    </div>
  )
}
