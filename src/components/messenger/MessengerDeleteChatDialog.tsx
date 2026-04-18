import { createPortal } from 'react-dom'

type DeleteUi =
  | null
  | { step: 'dm-pick' }
  | { step: 'confirm'; kind: 'dm-me' | 'dm-all' | 'leave-group' | 'leave-channel' | 'purge-gc' }

export function MessengerDeleteChatDialog(props: {
  messengerDeleteUi: DeleteUi
  deleteChatBusy: boolean
  deleteFlowPurgeGcKind: 'group' | 'channel' | null
  onBackdropClose: () => void
  onCancelDmPick: () => void
  onPickDmMe: () => void
  onPickDmAll: () => void
  onBackOrCancelConfirm: () => void
  onConfirm: () => void
}) {
  const {
    messengerDeleteUi,
    deleteChatBusy,
    deleteFlowPurgeGcKind,
    onBackdropClose,
    onCancelDmPick,
    onPickDmMe,
    onPickDmAll,
    onBackOrCancelConfirm,
    onConfirm,
  } = props
  if (!messengerDeleteUi) return null
  return createPortal(
    <div className="confirm-dialog-root">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Закрыть"
        disabled={deleteChatBusy}
        onClick={onBackdropClose}
      />
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="messenger-delete-chat-title"
        onClick={(e) => e.stopPropagation()}
      >
        {messengerDeleteUi.step === 'dm-pick' ? (
          <>
            <h2 id="messenger-delete-chat-title" className="confirm-dialog__title">
              Удалить чат
            </h2>
            <p className="dashboard-messenger__delete-chat-hint">
              <strong>Только у себя</strong> — чат пропадёт в вашем списке; у собеседника переписка останется.
            </p>
            <p className="dashboard-messenger__delete-chat-hint">
              <strong>У всех</strong> — диалог удалится для обоих, история сообщений будет стёрта.
            </p>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--secondary"
                disabled={deleteChatBusy}
                onClick={onCancelDmPick}
              >
                Отмена
              </button>
              <button
                type="button"
                className="confirm-dialog__btn"
                disabled={deleteChatBusy}
                onClick={onPickDmMe}
              >
                Только у меня
              </button>
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--danger"
                disabled={deleteChatBusy}
                onClick={onPickDmAll}
              >
                У всех
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="messenger-delete-chat-title" className="confirm-dialog__title">
              {messengerDeleteUi.kind === 'dm-me'
                ? 'Убрать чат у себя?'
                : messengerDeleteUi.kind === 'dm-all'
                  ? 'Удалить переписку у всех?'
                  : messengerDeleteUi.kind === 'leave-group'
                    ? 'Выйти из группы?'
                    : messengerDeleteUi.kind === 'leave-channel'
                      ? 'Выйти из канала?'
                      : deleteFlowPurgeGcKind === 'channel'
                        ? 'Удалить канал для всех?'
                        : 'Удалить группу для всех?'}
            </h2>
            <p className="dashboard-messenger__delete-chat-hint">
              {messengerDeleteUi.kind === 'dm-me'
                ? 'Диалог исчезнет только у вас.'
                : messengerDeleteUi.kind === 'dm-all'
                  ? 'Это действие нельзя отменить. Переписка будет удалена для всех участников личного чата.'
                  : messengerDeleteUi.kind === 'leave-group' || messengerDeleteUi.kind === 'leave-channel'
                    ? 'Вы перестанете быть участником. История останется у остальных.'
                    : 'Чат будет удалён для всех участников. Это действие необратимо.'}
            </p>
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--secondary"
                disabled={deleteChatBusy}
                onClick={onBackOrCancelConfirm}
              >
                {messengerDeleteUi.kind === 'dm-me' || messengerDeleteUi.kind === 'dm-all' ? 'Назад' : 'Отмена'}
              </button>
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--danger"
                disabled={deleteChatBusy}
                onClick={onConfirm}
              >
                {deleteChatBusy ? '…' : 'Подтвердить'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
