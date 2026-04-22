import { useMemo, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

export type RoomManageParticipantRow = {
  peerId: string
  name: string
  avatarUrl?: string | null
  authUserId: string | null
  messageCount: number
  isLocal: boolean
  isDbHost: boolean
  isRoomAdmin: boolean
}

export type RoomManageHostJoinRequest = {
  requestId: string
  displayName: string
}

export function RoomManageModal({
  open,
  onClose,
  participantCount,
  chatMessageCount,
  rows,
  canMutePeers,
  canAssignRoomAdmins,
  dbHostUserId,
  onMutePeer,
  onAssignRoomAdmin,
  onRemoveRoomAdmin,
  onRemoveFromRoom,
  hostJoinRequests,
  onApproveHostJoinRequest,
  onDenyHostJoinRequest,
}: {
  open: boolean
  onClose: () => void
  participantCount: number
  chatMessageCount: number
  rows: RoomManageParticipantRow[]
  canMutePeers: boolean
  canAssignRoomAdmins: boolean
  dbHostUserId: string | null
  onMutePeer: (peerId: string) => void
  onAssignRoomAdmin: (userId: string) => void
  onRemoveRoomAdmin: (userId: string) => void
  onRemoveFromRoom: (peerId: string, options: { alsoBan: boolean; authUserId: string | null }) => void
  /** `null` — блок не показываем (не хост БД); иначе список ожидающих запросов на вход. */
  hostJoinRequests?: RoomManageHostJoinRequest[] | null
  onApproveHostJoinRequest?: (req: RoomManageHostJoinRequest) => void
  onDenyHostJoinRequest?: (req: RoomManageHostJoinRequest) => void
}) {
  const [removeDraft, setRemoveDraft] = useState<{
    peerId: string
    name: string
    authUserId: string | null
    alsoBan: boolean
  } | null>(null)

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1
      if (a.isDbHost !== b.isDbHost) return a.isDbHost ? -1 : 1
      return a.name.localeCompare(b.name, 'ru')
    })
  }, [rows])

  if (!open) return null

  return (
    <>
      <div className="room-manage-modal-root">
        <button type="button" className="room-manage-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
        <div
          className="room-manage-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-manage-modal-title"
        >
          <div className="room-manage-modal__head">
            <h2 id="room-manage-modal-title" className="room-manage-modal__title">
              Управление комнатой
            </h2>
            <button type="button" className="room-manage-modal__close" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
          {hostJoinRequests != null ? (
            <div className="room-manage-modal__join">
              <div className="room-manage-modal__join-head">
                <span className="room-manage-modal__join-title">Запросы на вход</span>
                {hostJoinRequests.length > 0 ? (
                  <span className="room-manage-modal__join-count">{hostJoinRequests.length}</span>
                ) : null}
              </div>
              {hostJoinRequests.length === 0 ? (
                <p className="room-manage-modal__join-empty">Нет активных запросов</p>
              ) : (
                <ul className="room-manage-modal__join-list">
                  {hostJoinRequests.map((req) => (
                    <li key={req.requestId} className="room-manage-modal__join-item">
                      <span className="room-manage-modal__join-name">{req.displayName}</span>
                      <div className="room-manage-modal__join-actions">
                        <button
                          type="button"
                          className="room-manage-modal__join-approve"
                          onClick={() => onApproveHostJoinRequest?.(req)}
                        >
                          ✓ Впустить
                        </button>
                        <button
                          type="button"
                          className="room-manage-modal__join-deny"
                          onClick={() => onDenyHostJoinRequest?.(req)}
                          aria-label="Отклонить"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <div className="room-manage-modal__stats">
            <span>Участников: {participantCount}</span>
            <span>Сообщений в чате: {chatMessageCount}</span>
          </div>
          <ul className="room-manage-modal__list">
            {sortedRows.map((r) => (
              <li key={r.peerId} className="room-manage-modal__row">
                <div className="room-manage-modal__who">
                  {r.avatarUrl ? (
                    <img src={r.avatarUrl} alt="" className="room-manage-modal__avatar" width={40} height={40} />
                  ) : (
                    <div className="room-manage-modal__avatar-fallback" aria-hidden>
                      {(r.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="room-manage-modal__meta">
                    <span className="room-manage-modal__name">
                      {r.name}
                      {r.isLocal ? ' (вы)' : ''}
                      {r.isDbHost ? ' · хост' : ''}
                      {r.isRoomAdmin ? ' · админ комнаты' : ''}
                    </span>
                    <span className="room-manage-modal__msgs">Сообщений: {r.messageCount}</span>
                  </div>
                </div>
                <div className="room-manage-modal__actions">
                  {canAssignRoomAdmins &&
                  r.authUserId &&
                  dbHostUserId &&
                  r.authUserId !== dbHostUserId ? (
                    r.isRoomAdmin ? (
                      <button
                        type="button"
                        className="room-manage-modal__btn room-manage-modal__btn--secondary"
                        onClick={() => onRemoveRoomAdmin(r.authUserId!)}
                      >
                        Снять админа
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="room-manage-modal__btn room-manage-modal__btn--secondary"
                        onClick={() => onAssignRoomAdmin(r.authUserId!)}
                      >
                        Админ комнаты
                      </button>
                    )
                  ) : null}
                  {canMutePeers && !r.isLocal ? (
                    <button type="button" className="room-manage-modal__btn" onClick={() => onMutePeer(r.peerId)}>
                      Заглушить
                    </button>
                  ) : null}
                  {!r.isLocal ? (
                    <button
                      type="button"
                      className="room-manage-modal__btn room-manage-modal__btn--danger"
                      onClick={() =>
                        setRemoveDraft({
                          peerId: r.peerId,
                          name: r.name,
                          authUserId: r.authUserId,
                          alsoBan: Boolean(r.authUserId),
                        })
                      }
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={removeDraft != null}
        title="Удалить из комнаты?"
        message={
          removeDraft ? (
            <div className="room-manage-remove-confirm">
              <p>Выгнать «{removeDraft.name}» из комнаты?</p>
              {removeDraft.authUserId ? (
                <label className="room-manage-remove-confirm__ban">
                  <input
                    type="checkbox"
                    checked={removeDraft.alsoBan}
                    onChange={(e) =>
                      setRemoveDraft((d) => (d ? { ...d, alsoBan: e.target.checked } : null))
                    }
                  />
                  <span>Заблокировать повторный вход (бан по аккаунту)</span>
                </label>
              ) : (
                <p className="room-manage-remove-confirm__hint">
                  У гостя нет привязанного аккаунта — бан в списке комнаты недоступен, только исключение из эфира.
                </p>
              )}
            </div>
          ) : null
        }
        cancelLabel="Отмена"
        confirmLabel="Удалить"
        onCancel={() => setRemoveDraft(null)}
        onConfirm={() => {
          if (!removeDraft) return
          onRemoveFromRoom(removeDraft.peerId, {
            alsoBan: removeDraft.alsoBan && Boolean(removeDraft.authUserId),
            authUserId: removeDraft.authUserId,
          })
          setRemoveDraft(null)
        }}
      />
    </>
  )
}
