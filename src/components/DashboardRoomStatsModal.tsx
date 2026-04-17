import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { RoomChatConversationSummary } from '../lib/chatArchive'
import {
  approximateChatSpanSeconds,
  fetchDashboardRoomStatsForHost,
  fetchRoomChatGuestsDashboard,
  fetchRoomChatMembersDashboard,
  hostRoomBroadcastSeconds,
  type DashboardHostRoomStats,
  type DashboardRoomGuestSender,
  type DashboardRoomMemberProfile,
  type DashboardRoomModalSubject,
} from '../lib/dashboardRoomStats'
import { formatDurationRuSeconds } from '../lib/formatDurationRu'
import { ensureDirectConversationWithUser } from '../lib/messenger'
import { getContactStatuses, setContactPin, type ContactStatus } from '../lib/socialGraph'
import {
  CamIcon,
  ChatBubbleIcon,
  InviteIcon,
  ParticipantsBadgeIcon,
  StarIcon,
  TrashIcon,
} from './icons'

function summaryFromHostStats(
  host: DashboardHostRoomStats,
  slug: string,
  fallbackTitle: string,
): RoomChatConversationSummary {
  return {
    id: host.conversationId!,
    title: host.chatTitle?.trim() || fallbackTitle,
    roomSlug: slug || null,
    createdAt: host.chatCreatedAt ?? new Date(0).toISOString(),
    closedAt: host.chatClosedAt,
    lastMessageAt: null,
    lastMessagePreview: null,
    messageCount: host.messageCount,
  }
}

export function DashboardRoomStatsModal({
  open,
  onClose,
  subject,
  joinableSlugs,
  currentUserId,
  onOpenChat,
  onRemoveFromList,
  removeFromListBusy,
}: {
  open: boolean
  onClose: () => void
  subject: DashboardRoomModalSubject | null
  joinableSlugs: Set<string>
  /** Для действий «написать» / «в контактах» у участников с аккаунтом */
  currentUserId?: string | null
  onOpenChat: (payload: { conversationId: string; summary: RoomChatConversationSummary }) => void
  onRemoveFromList?: () => void
  removeFromListBusy?: boolean
}) {
  const navigate = useNavigate()
  const [hostStats, setHostStats] = useState<DashboardHostRoomStats | null>(null)
  const [hostErr, setHostErr] = useState<string | null>(null)
  const [members, setMembers] = useState<DashboardRoomMemberProfile[] | null>(null)
  const [guests, setGuests] = useState<DashboardRoomGuestSender[] | null>(null)
  const [guestDistinct, setGuestDistinct] = useState(0)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [memberContactStatuses, setMemberContactStatuses] = useState<Record<string, ContactStatus>>({})
  const [pendingDmUserId, setPendingDmUserId] = useState<string | null>(null)
  const [pendingContactUserId, setPendingContactUserId] = useState<string | null>(null)
  const [memberSocialErr, setMemberSocialErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !subject) {
      setHostStats(null)
      setHostErr(null)
      setMembers(null)
      setGuests(null)
      setGuestDistinct(0)
      setLoadErr(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadErr(null)
    setHostErr(null)
    setHostStats(null)
    setMembers(null)
    setGuests(null)
    setGuestDistinct(0)
    setMemberContactStatuses({})
    setMemberSocialErr(null)

    const slug =
      subject.kind === 'persistent'
        ? subject.slug.trim()
        : subject.summary.roomSlug?.trim() ?? ''

    void (async () => {
      let convId: string | null = null
      let h: DashboardHostRoomStats | null = null

      if (subject.kind === 'persistent') {
        const hr = await fetchDashboardRoomStatsForHost(subject.slug)
        if (cancelled) return
        if (hr.error) {
          setHostErr(hr.error)
        } else if (hr.data) {
          h = hr.data
          setHostStats(hr.data)
          convId = hr.data.conversationId?.trim() ?? null
        }
      } else {
        convId = subject.summary.id
        if (slug) {
          const hr = await fetchDashboardRoomStatsForHost(slug)
          if (cancelled) return
          if (!hr.error && hr.data) {
            h = hr.data
            setHostStats(hr.data)
          }
        }
      }

      const cid =
        subject.kind === 'archive'
          ? subject.summary.id.trim()
          : (h?.conversationId ?? convId)?.trim() ?? ''

      if (!cid) {
        if (cancelled) return
        setLoading(false)
        return
      }

      const [memRes, gRes] = await Promise.all([
        fetchRoomChatMembersDashboard(cid),
        fetchRoomChatGuestsDashboard(cid),
      ])
      if (cancelled) return
      if (memRes.error || gRes.error) {
        setLoadErr(memRes.error ?? gRes.error ?? 'Ошибка загрузки')
      }
      setMembers(memRes.data ?? [])
      setGuests(gRes.data?.guests ?? [])
      setGuestDistinct(gRes.data?.guestDistinctCount ?? 0)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, subject])

  useEffect(() => {
    if (!open || !members || !currentUserId?.trim()) {
      if (!open) setMemberContactStatuses({})
      return
    }
    const me = currentUserId.trim()
    const ids = members.map((m) => m.userId).filter((id) => id && id !== me)
    if (ids.length === 0) {
      setMemberContactStatuses({})
      return
    }
    let cancelled = false
    void getContactStatuses(ids).then((res) => {
      if (cancelled) return
      if (res.error) {
        setMemberSocialErr(res.error)
        setMemberContactStatuses({})
        return
      }
      setMemberSocialErr(null)
      setMemberContactStatuses(res.data ?? {})
    })
    return () => {
      cancelled = true
    }
  }, [open, members, currentUserId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const openMemberDirectChat = async (targetUserId: string, displayName: string) => {
    if (!targetUserId || pendingDmUserId) return
    setPendingDmUserId(targetUserId)
    setMemberSocialErr(null)
    const result = await ensureDirectConversationWithUser(targetUserId, displayName)
    setPendingDmUserId(null)
    if (result.error || !result.data) {
      setMemberSocialErr(result.error ?? 'Не удалось открыть личный чат.')
      return
    }
    onClose()
    navigate(`/dashboard/messenger/${encodeURIComponent(result.data)}`)
  }

  const toggleMemberContact = async (targetUserId: string, pinnedByMe: boolean) => {
    if (!targetUserId || pendingContactUserId) return
    setPendingContactUserId(targetUserId)
    setMemberSocialErr(null)
    const result = await setContactPin(targetUserId, !pinnedByMe)
    setPendingContactUserId(null)
    if (result.error) {
      setMemberSocialErr(result.error)
      return
    }
    if (result.data) {
      setMemberContactStatuses((prev) => ({ ...prev, [targetUserId]: result.data! }))
    }
  }

  if (!open || !subject) return null

  const archiveSummary: RoomChatConversationSummary | null =
    subject.kind === 'archive' ? subject.summary : null

  const slug =
    subject.kind === 'persistent'
      ? subject.slug.trim()
      : subject.summary.roomSlug?.trim() ?? ''

  const title =
    subject.kind === 'persistent'
      ? subject.preview?.displayName?.trim() || subject.slug
      : subject.summary.title

  const messageCount =
    hostStats?.conversationId && hostStats.messageCount != null
      ? hostStats.messageCount
      : archiveSummary?.messageCount ?? 0

  const chatEnabled = messageCount > 0

  const canJoin = Boolean(slug && joinableSlugs.has(slug))

  const broadcastSeconds =
    hostStats && !hostErr
      ? hostRoomBroadcastSeconds(hostStats)
      : archiveSummary
        ? approximateChatSpanSeconds(archiveSummary)
        : null

  const broadcastLabel =
    hostStats && !hostErr
      ? formatDurationRuSeconds(broadcastSeconds ?? 0)
      : broadcastSeconds != null
        ? `${formatDurationRuSeconds(broadcastSeconds)} (оценка по датам чата)`
        : '—'

  const registeredCount =
    members != null ? members.length : hostStats?.registeredMemberCount != null ? hostStats.registeredMemberCount : null
  const totalPeopleHint =
    registeredCount != null ? `${registeredCount} с аккаунтом, гостевых имён: ${guestDistinct}` : '—'

  return (
    <div className="confirm-dialog-root">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="confirm-dialog dashboard-profile-modal__dialog dashboard-room-stats-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dashboard-room-stats-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dashboard-room-stats-title" className="confirm-dialog__title">
          Статистика комнаты
        </h2>
        <div className="dashboard-profile-modal__scroll">
          <p className="dashboard-room-info-modal__title">{title}</p>
          {slug ? (
            <p className="dashboard-field__hint">
              Ссылка: <code className="admin-dashboard-code">/r/{slug}</code>
            </p>
          ) : null}
          <p className="dashboard-field__hint">
            <strong>Время в эфире (открыта):</strong> {broadcastLabel}
          </p>
          <p className="dashboard-field__hint">
            <strong>Сообщений в чате:</strong> {messageCount}
          </p>
          <p className="dashboard-field__hint">
            <strong>Участники:</strong> {totalPeopleHint}
          </p>

          {loading ? <p className="dashboard-field__hint">Загрузка списков…</p> : null}
          {hostErr && subject.kind === 'persistent' ? (
            <p className="join-error">Не удалось загрузить данные эфира: {hostErr}</p>
          ) : null}
          {loadErr ? <p className="join-error">{loadErr}</p> : null}
          {memberSocialErr ? <p className="join-error">{memberSocialErr}</p> : null}

          {!loading && members && members.length > 0 ? (
            <div>
              <p className="dashboard-field__label" style={{ marginTop: 12 }}>
                С аккаунтом
              </p>
              <ul className="dashboard-room-info-modal__members">
                {members.map((m) => {
                  const me = currentUserId?.trim() ?? ''
                  const isSelf = Boolean(me && m.userId === me)
                  const st = memberContactStatuses[m.userId]
                  const canSocial = Boolean(me && !isSelf)
                  const contactTitle = st?.pinnedByMe
                    ? 'Убрать из контактов'
                    : 'Добавить в контакты'
                  const contactAria = contactTitle
                  return (
                    <li key={m.userId} className="dashboard-room-info-modal__member dashboard-room-stats-modal__member">
                      <div className="dashboard-room-stats-modal__member-main">
                        {m.avatarUrl ? (
                          <img src={m.avatarUrl} alt="" className="dashboard-room-info-modal__av" />
                        ) : (
                          <span className="dashboard-room-info-modal__av dashboard-room-info-modal__av--ph">
                            {m.displayName.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="dashboard-room-stats-modal__member-name">{m.displayName}</span>
                      </div>
                      {isSelf ? (
                        <span className="dashboard-field__hint dashboard-room-stats-modal__you">Вы</span>
                      ) : canSocial ? (
                        <div className="dashboard-room-stats-modal__member-actions">
                          <button
                            type="button"
                            className="join-btn dashboard-room-stats-modal__icon-btn"
                            disabled={pendingDmUserId === m.userId}
                            title="Написать в личный чат"
                            aria-label="Написать в личный чат"
                            onClick={() => void openMemberDirectChat(m.userId, m.displayName)}
                          >
                            <span
                              className={`dashboard-room-stats-modal__glyph${
                                pendingDmUserId === m.userId ? ' dashboard-room-stats-modal__glyph--busy' : ''
                              }`}
                            >
                              <ChatBubbleIcon />
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`join-btn dashboard-room-stats-modal__icon-btn${st?.pinnedByMe ? ' dashboard-room-stats-modal__icon-btn--on' : ''}`}
                            disabled={pendingContactUserId === m.userId}
                            title={contactTitle}
                            aria-label={contactAria}
                            onClick={() => void toggleMemberContact(m.userId, st?.pinnedByMe ?? false)}
                          >
                            <span
                              className={`dashboard-room-stats-modal__glyph${
                                pendingContactUserId === m.userId ? ' dashboard-room-stats-modal__glyph--busy' : ''
                              }`}
                            >
                              {st?.isMutualContact ? (
                                <ParticipantsBadgeIcon />
                              ) : st?.pinnedByMe ? (
                                <StarIcon filled />
                              ) : (
                                <InviteIcon />
                              )}
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          {!loading && guests && guests.length > 0 ? (
            <div>
              <p className="dashboard-field__label" style={{ marginTop: 12 }}>
                Гости (по сообщениям)
              </p>
              <p className="dashboard-field__hint" style={{ marginTop: 4 }}>
                У гостей нет аккаунта — личное сообщение или контакты недоступны.
              </p>
              <ul className="dashboard-room-info-modal__members">
                {guests.map((g, i) => (
                  <li key={`${g.senderPeerId}-${i}`} className="dashboard-room-info-modal__member">
                    <span className="dashboard-room-info-modal__av dashboard-room-info-modal__av--ph">
                      {(g.senderNameSnapshot || 'Г').charAt(0).toUpperCase()}
                    </span>
                    <span>
                      {g.senderNameSnapshot}
                      {g.messageCount > 1 ? ` · ${g.messageCount} сообщ.` : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="dashboard-profile-modal__foot dashboard-room-info-modal__foot dashboard-room-stats-modal__foot">
          <div className="dashboard-room-stats-modal__actions">
            {chatEnabled ? (
              <button
                type="button"
                className="confirm-dialog__btn"
                onClick={() => {
                  if (subject.kind === 'archive') {
                    onOpenChat({ conversationId: subject.summary.id, summary: subject.summary })
                  } else if (hostStats?.conversationId) {
                    onOpenChat({
                      conversationId: hostStats.conversationId,
                      summary: summaryFromHostStats(hostStats, slug, title),
                    })
                  }
                  onClose()
                }}
              >
                <span className="dashboard-room-stats-modal__btn-inner">
                  <ChatBubbleIcon />
                  Открыть чат
                </span>
              </button>
            ) : (
              <p className="dashboard-field__hint" style={{ margin: 0 }}>
                Сообщений не было — переписка недоступна.
              </p>
            )}
            {canJoin && slug ? (
              <Link
                to={`/r/${encodeURIComponent(slug)}`}
                className="confirm-dialog__btn confirm-dialog__btn--secondary dashboard-room-stats-modal__cam-link"
              >
                <span className="dashboard-room-stats-modal__btn-inner">
                  <CamIcon />
                  В эфир
                </span>
              </Link>
            ) : null}
            {archiveSummary && onRemoveFromList ? (
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--danger"
                disabled={removeFromListBusy}
                onClick={onRemoveFromList}
              >
                <span className="dashboard-room-stats-modal__btn-inner">
                  <TrashIcon />
                  Убрать из списка
                </span>
              </button>
            ) : null}
          </div>
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
