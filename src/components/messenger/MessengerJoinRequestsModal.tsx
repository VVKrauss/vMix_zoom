import { createPortal } from 'react-dom'
import { useMemo } from 'react'
import { XCloseIcon } from '../icons'
import type { ConversationJoinRequest } from '../../lib/chatRequests'
import type { ConversationMemberRow } from '../../lib/conversationMembers'
import { memberKickAllowed, messengerContactDisplayName } from '../../lib/messengerDashboardUtils'
import { useMessengerContactAliasesMap } from '../../hooks/useMessengerContactAliasesMap'

export type MessengerJoinRequestsModalProps = {
  open: boolean
  onClose: () => void
  joinRequestsLoading: boolean
  membersLoading: boolean
  conversationJoinRequests: ConversationJoinRequest[]
  conversationMembers: ConversationMemberRow[]
  joinRequestInFlight: boolean
  activeConversationRole: string | null
  currentUserId: string | null
  kickMemberBusyId: string | null
  onApproveRequest: (requestId: string) => void
  onDenyRequest: (requestId: string) => void
  onKickMember: (userId: string) => void
}

export function MessengerJoinRequestsModal({
  open,
  onClose,
  joinRequestsLoading,
  membersLoading,
  conversationJoinRequests,
  conversationMembers,
  joinRequestInFlight,
  activeConversationRole,
  currentUserId,
  kickMemberBusyId,
  onApproveRequest,
  onDenyRequest,
  onKickMember,
}: MessengerJoinRequestsModalProps) {
  const joinModalUserIds = useMemo(() => {
    const s = new Set<string>()
    for (const r of conversationJoinRequests) {
      const id = r.userId?.trim()
      if (id) s.add(id)
    }
    for (const m of conversationMembers) {
      const id = m.userId?.trim()
      if (id) s.add(id)
    }
    return Array.from(s)
  }, [conversationJoinRequests, conversationMembers])

  const aliasByUserId = useMessengerContactAliasesMap(open, joinModalUserIds)

  if (!open) return null

  return createPortal(
    <div
      className="confirm-dialog-root dashboard-messenger-join-requests-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-requests-title"
    >
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="confirm-dialog dashboard-messenger-join-requests-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dashboard-messenger-join-requests-dialog__header">
          <h2 id="join-requests-title" className="dashboard-messenger-join-requests-dialog__title">
            Запросы на вступление
          </h2>
          <button type="button" className="dashboard-messenger-join-requests-dialog__close" aria-label="Закрыть" onClick={onClose}>
            <XCloseIcon />
          </button>
        </div>
        <div className="dashboard-messenger-join-requests-dialog__body">
          <div className="dashboard-messenger-join-requests-dialog__section">
            <div className="dashboard-messenger-join-requests-dialog__section-title">Запросы</div>
            {joinRequestsLoading ? (
              <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" />
            ) : conversationJoinRequests.length === 0 ? (
              <p className="dashboard-messenger-join-requests-dialog__empty">Нет новых запросов на вступление.</p>
            ) : (
              <ul className="dashboard-messenger-join-requests-dialog__list">
                {conversationJoinRequests.map((request) => {
                  const disp = messengerContactDisplayName(request.userId, request.displayName, aliasByUserId)
                  return (
                  <li key={request.requestId} className="dashboard-messenger-join-requests-dialog__item">
                    <div className="dashboard-messenger-join-requests-dialog__item-main">
                      <div className="dashboard-messenger-join-requests-dialog__name">{disp.title}</div>
                      {disp.profileName ? (
                        <div className="dashboard-messenger-join-requests-dialog__profile-sub">
                          В профиле: {disp.profileName}
                        </div>
                      ) : null}
                      <div className="dashboard-messenger-join-requests-dialog__meta">
                        {new Date(request.createdAt).toLocaleString('ru-RU', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </div>
                    </div>
                    <div className="dashboard-messenger-join-requests-dialog__item-actions">
                      <button
                        type="button"
                        className="dashboard-messenger-join-requests-dialog__approve"
                        disabled={joinRequestInFlight}
                        onClick={() => onApproveRequest(request.requestId)}
                      >
                        Одобрить
                      </button>
                      <button
                        type="button"
                        className="dashboard-messenger-join-requests-dialog__deny"
                        disabled={joinRequestInFlight}
                        onClick={() => onDenyRequest(request.requestId)}
                      >
                        Отклонить
                      </button>
                    </div>
                  </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="dashboard-messenger-join-requests-dialog__section">
            <div className="dashboard-messenger-join-requests-dialog__section-title">
              Участники{conversationMembers.length > 0 ? ` (${conversationMembers.length})` : ''}
            </div>
            {membersLoading ? (
              <div className="dashboard-messenger__pane-loader" aria-label="Загрузка…" />
            ) : conversationMembers.length === 0 ? (
              <p className="dashboard-messenger-join-requests-dialog__empty">Список участников пуст.</p>
            ) : (
              <ul className="dashboard-messenger-join-requests-dialog__list">
                {conversationMembers.map((m) => {
                  const disp = messengerContactDisplayName(m.userId, m.displayName, aliasByUserId)
                  return (
                  <li key={m.userId} className="dashboard-messenger-join-requests-dialog__item">
                    <div className="dashboard-messenger-join-requests-dialog__item-main">
                      <div className="dashboard-messenger-join-requests-dialog__name">{disp.title}</div>
                      {disp.profileName ? (
                        <div className="dashboard-messenger-join-requests-dialog__profile-sub">
                          В профиле: {disp.profileName}
                        </div>
                      ) : null}
                      <div className="dashboard-messenger-join-requests-dialog__meta">
                        {m.role === 'owner'
                          ? 'Владелец'
                          : m.role === 'admin'
                          ? 'Администратор'
                          : m.role === 'moderator'
                          ? 'Модератор'
                          : 'Участник'}
                      </div>
                    </div>
                    {memberKickAllowed(activeConversationRole, currentUserId, m) ? (
                      <div className="dashboard-messenger-join-requests-dialog__item-actions">
                        <button
                          type="button"
                          className="dashboard-messenger-join-requests-dialog__kick"
                          disabled={Boolean(kickMemberBusyId)}
                          onClick={() => onKickMember(m.userId)}
                        >
                          {kickMemberBusyId === m.userId ? '…' : 'Исключить'}
                        </button>
                      </div>
                    ) : null}
                  </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
