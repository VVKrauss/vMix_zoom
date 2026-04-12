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
