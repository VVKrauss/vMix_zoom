import { createPortal } from 'react-dom'
import { XCloseIcon } from '../icons'
import type { ConversationJoinRequest } from '../../lib/chatRequests'
import type { ConversationMemberRow } from '../../lib/conversationMembers'
import { memberKickAllowed } from '../../lib/messengerDashboardUtils'

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
                {conversationJoinRequests.map((request) => (
                  <li key={request.requestId} className="dashboard-messenger-join-requests-dialog__item">
                    <div className="dashboard-messenger-join-requests-dialog__item-main">
                      <div className="dashboard-messenger-join-requests-dialog__name">{request.displayName}</div>
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
                ))}
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
                {conversationMembers.map((m) => (
                  <li key={m.userId} className="dashboard-messenger-join-requests-dialog__item">
                    <div className="dashboard-messenger-join-requests-dialog__item-main">
                      <div className="dashboard-messenger-join-requests-dialog__name">{m.displayName}</div>
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
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
