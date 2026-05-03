import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MessengerConversationKind } from '../../lib/messengerConversations'
import {
  fetchConversationAdminStats,
  type ConversationAdminStatsPayload,
} from '../../lib/conversationStats'

const PERIODS = [7, 30, 90] as const

const MESSAGE_KIND_LABELS: Record<string, string> = {
  text: 'Текст',
  system: 'Системные',
  image: 'Фото',
  audio: 'Голосовые',
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Владельцы',
  admin: 'Админы',
  moderator: 'Модераторы',
  member: 'Участники',
}

export type MessengerConversationStatsModalProps = {
  open: boolean
  conversationId: string | null
  conversationKind: MessengerConversationKind | null
  title: string
  onClose: () => void
}

export function MessengerConversationStatsModal({
  open,
  conversationId,
  conversationKind,
  title,
  onClose,
}: MessengerConversationStatsModalProps) {
  const [periodDays, setPeriodDays] = useState<(typeof PERIODS)[number]>(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ConversationAdminStatsPayload | null>(null)

  const load = useCallback(async () => {
    const id = conversationId?.trim()
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchConversationAdminStats(id, periodDays)
      if (res.error) {
        setStats(null)
        setError(res.error)
        return
      }
      setStats(res.data)
    } finally {
      setLoading(false)
    }
  }, [conversationId, periodDays])

  useEffect(() => {
    if (!open || !conversationId?.trim()) return
    void load()
  }, [open, conversationId, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const dailyMax = useMemo(() => {
    if (!stats?.daily.length) return 1
    return Math.max(1, ...stats.daily.map((d) => d.messages))
  }, [stats])

  if (!open || (conversationKind !== 'group' && conversationKind !== 'channel')) return null

  const headingKind = conversationKind === 'channel' ? 'Канал' : 'Группа'

  return createPortal(
    <div className="messenger-stats-modal-root" role="dialog" aria-modal="true" aria-labelledby="messenger-stats-title">
      <button type="button" className="messenger-settings-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="messenger-settings-modal messenger-stats-modal app-scroll">
        <h2 id="messenger-stats-title" className="messenger-settings-modal__title">
          Статистика · {headingKind}
        </h2>
        <p className="messenger-settings-modal__hint" style={{ marginTop: -6, marginBottom: 12 }}>
          {title.trim() || 'Без названия'}
        </p>

        <div className="messenger-settings-modal__section">
          <span className="messenger-settings-modal__label">Период</span>
          <div className="messenger-settings-modal__segment" role="group" aria-label="Количество дней">
            {PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                className={`messenger-settings-modal__segment-btn${
                  periodDays === d ? ' messenger-settings-modal__segment-btn--active' : ''
                }`}
                aria-pressed={periodDays === d}
                disabled={loading}
                onClick={() => setPeriodDays(d)}
              >
                {d} дн.
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="messenger-settings-modal__error">{error}</p> : null}
        {loading && !stats ? <p className="messenger-settings-modal__busy">Загрузка…</p> : null}

        {stats ? (
          <>
            <div className="messenger-stats-modal__metrics">
              <div className="messenger-stats-modal__metric">
                <span className="messenger-stats-modal__metric-value">{stats.member_count}</span>
                <span className="messenger-stats-modal__metric-label">Участников сейчас</span>
              </div>
              <div className="messenger-stats-modal__metric">
                <span className="messenger-stats-modal__metric-value">{stats.pending_join_requests}</span>
                <span className="messenger-stats-modal__metric-label">Заявок на вступление</span>
              </div>
              <div className="messenger-stats-modal__metric">
                <span className="messenger-stats-modal__metric-value">{stats.messages_non_reaction}</span>
                <span className="messenger-stats-modal__metric-label">Сообщений за период</span>
              </div>
              <div className="messenger-stats-modal__metric">
                <span className="messenger-stats-modal__metric-value">{stats.unique_authors}</span>
                <span className="messenger-stats-modal__metric-label">Уникальных авторов</span>
              </div>
              <div className="messenger-stats-modal__metric">
                <span className="messenger-stats-modal__metric-value">{stats.reactions_count}</span>
                <span className="messenger-stats-modal__metric-label">Реакций</span>
              </div>
              {stats.conversation_kind === 'group' && stats.messages_with_reply != null ? (
                <div className="messenger-stats-modal__metric">
                  <span className="messenger-stats-modal__metric-value">{stats.messages_with_reply}</span>
                  <span className="messenger-stats-modal__metric-label">Ответов и цитат</span>
                </div>
              ) : null}
              {stats.conversation_kind === 'channel' &&
              stats.channel_posts != null &&
              stats.channel_comments != null ? (
                <>
                  <div className="messenger-stats-modal__metric">
                    <span className="messenger-stats-modal__metric-value">{stats.channel_posts}</span>
                    <span className="messenger-stats-modal__metric-label">Постов в ленте</span>
                  </div>
                  <div className="messenger-stats-modal__metric">
                    <span className="messenger-stats-modal__metric-value">{stats.channel_comments}</span>
                    <span className="messenger-stats-modal__metric-label">Комментариев</span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="messenger-settings-modal__section">
              <span className="messenger-settings-modal__label">Активность по дням (сообщения)</span>
              <div className="messenger-stats-modal__daily" aria-hidden={stats.daily.length === 0}>
                {stats.daily.length === 0 ? (
                  <p className="messenger-settings-modal__hint">Нет данных за выбранный период.</p>
                ) : (
                  stats.daily.map((row) => {
                    const h = Math.round((row.messages / dailyMax) * 100)
                    return (
                      <div key={row.day} className="messenger-stats-modal__daily-slot" title={`${row.day}: ${row.messages}`}>
                        <div
                          className="messenger-stats-modal__daily-bar"
                          style={{ height: `${Math.max(h, row.messages > 0 ? 8 : 2)}%` }}
                        />
                      </div>
                    )
                  })
                )}
              </div>
              {stats.daily.length > 0 ? (
                <p className="messenger-settings-modal__hint" style={{ marginTop: 6 }}>
                  Слева направо — от более ранней даты к сегодня (UTC).
                </p>
              ) : null}
            </div>

            <div className="messenger-settings-modal__section">
              <span className="messenger-settings-modal__label">Роли участников</span>
              <ul className="messenger-stats-modal__list">
                {Object.entries(stats.members_by_role)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([role, cnt]) => (
                    <li key={role}>
                      <span>{ROLE_LABELS[role] ?? role}</span>
                      <span>{cnt}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="messenger-settings-modal__section">
              <span className="messenger-settings-modal__label">Типы сообщений за период</span>
              <ul className="messenger-stats-modal__list">
                {Object.entries(stats.messages_by_kind)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([kind, cnt]) => (
                    <li key={kind}>
                      <span>{MESSAGE_KIND_LABELS[kind] ?? kind}</span>
                      <span>{cnt}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="messenger-settings-modal__section">
              <span className="messenger-settings-modal__label">Топ авторов за период</span>
              {stats.top_contributors.length === 0 ? (
                <p className="messenger-settings-modal__hint">Нет сообщений от пользователей.</p>
              ) : (
                <ol className="messenger-stats-modal__top">
                  {stats.top_contributors.map((u, idx) => (
                    <li key={u.user_id}>
                      <span className="messenger-stats-modal__top-rank">{idx + 1}.</span>
                      <span className="messenger-stats-modal__top-name">{u.display_name}</span>
                      <span className="messenger-stats-modal__top-count">{u.message_count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        ) : null}

        <div className="messenger-settings-modal__actions">
          <button type="button" className="messenger-settings-modal__done" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
