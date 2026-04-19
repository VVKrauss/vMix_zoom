import { createPortal } from 'react-dom'
import { useEffect } from 'react'

export type MessengerCreateConversationModalProps = {
  open: boolean
  onClose: () => void
  createError: string | null
  createKind: 'group' | 'channel'
  setCreateKind: (v: 'group' | 'channel') => void
  createBusy: boolean
  createIsOpen: boolean
  setCreateIsOpen: (v: boolean) => void
  createTitle: string
  setCreateTitle: (v: string) => void
  createNick: string
  setCreateNick: (v: string) => void
  createLogoFile: File | null
  setCreateLogoFile: (f: File | null) => void
  createChannelComments: 'comments' | 'reactions_only'
  setCreateChannelComments: (v: 'comments' | 'reactions_only') => void
  onSubmit: () => void
}

export function MessengerCreateConversationModal({
  open,
  onClose,
  createError,
  createKind,
  setCreateKind,
  createBusy,
  createIsOpen,
  setCreateIsOpen,
  createTitle,
  setCreateTitle,
  createNick,
  setCreateNick,
  createLogoFile,
  setCreateLogoFile,
  createChannelComments,
  setCreateChannelComments,
  onSubmit,
}: MessengerCreateConversationModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="messenger-settings-modal-root" role="dialog" aria-modal="true" aria-labelledby="messenger-create-title">
      <button type="button" className="messenger-settings-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="messenger-settings-modal">
        <h2 id="messenger-create-title" className="messenger-settings-modal__title">
          Создать
        </h2>

        {createError ? <p className="join-error">{createError}</p> : null}

        <div className="messenger-settings-modal__section">
          <span className="messenger-settings-modal__label">Тип</span>
          <div className="messenger-settings-modal__segment" role="group" aria-label="Тип">
            <button
              type="button"
              className={`messenger-settings-modal__segment-btn${
                createKind === 'group' ? ' messenger-settings-modal__segment-btn--active' : ''
              }`}
              onClick={() => setCreateKind('group')}
              disabled={createBusy}
            >
              Группа
            </button>
            <button
              type="button"
              className={`messenger-settings-modal__segment-btn${
                createKind === 'channel' ? ' messenger-settings-modal__segment-btn--active' : ''
              }`}
              onClick={() => setCreateKind('channel')}
              disabled={createBusy}
            >
              Канал
            </button>
          </div>
        </div>

        <div className="messenger-settings-modal__section">
          <span className="messenger-settings-modal__label">Доступ</span>
          <div className="messenger-settings-modal__segment" role="group" aria-label="Доступ">
            <button
              type="button"
              className={`messenger-settings-modal__segment-btn${
                createIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
              }`}
              onClick={() => setCreateIsOpen(true)}
              disabled={createBusy}
            >
              Открыто
            </button>
            <button
              type="button"
              className={`messenger-settings-modal__segment-btn${
                !createIsOpen ? ' messenger-settings-modal__segment-btn--active' : ''
              }`}
              onClick={() => setCreateIsOpen(false)}
              disabled={createBusy}
            >
              Закрыто
            </button>
          </div>
        </div>

        <div className="messenger-settings-modal__section">
          <label className="messenger-settings-modal__label" htmlFor="messenger-create-title-input">
            Название
          </label>
          <input
            id="messenger-create-title-input"
            className="dashboard-messenger__list-search-input"
            value={createTitle}
            disabled={createBusy}
            onChange={(e) => setCreateTitle(e.target.value)}
            placeholder={createKind === 'channel' ? 'Например: Новости' : 'Например: Команда'}
            autoComplete="off"
          />
        </div>

        <div className="messenger-settings-modal__section">
          <label className="messenger-settings-modal__label" htmlFor="messenger-create-nick-input">
            Ник (для ссылки)
          </label>
          <input
            id="messenger-create-nick-input"
            className="dashboard-messenger__list-search-input"
            value={createNick}
            disabled={createBusy}
            onChange={(e) => setCreateNick(e.target.value)}
            placeholder="team_chat"
            autoComplete="off"
            inputMode="text"
          />
          <p className="messenger-settings-modal__hint">Только a-z, 0-9, _ (3–32). Можно оставить пустым.</p>
        </div>

        <div className="messenger-settings-modal__section">
          <span className="messenger-settings-modal__label">Логотип</span>
          <input
            type="file"
            accept="image/*"
            disabled={createBusy}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              e.target.value = ''
              setCreateLogoFile(f)
            }}
          />
          {createLogoFile ? (
            <p className="messenger-settings-modal__hint">Выбрано: {createLogoFile.name}</p>
          ) : (
            <p className="messenger-settings-modal__hint">Опционально.</p>
          )}
        </div>

        {createKind === 'channel' ? (
          <div className="messenger-settings-modal__section">
            <span className="messenger-settings-modal__label">Обсуждение</span>
            <div className="messenger-settings-modal__segment" role="group" aria-label="Обсуждение">
              <button
                type="button"
                className={`messenger-settings-modal__segment-btn${
                  createChannelComments === 'comments' ? ' messenger-settings-modal__segment-btn--active' : ''
                }`}
                onClick={() => setCreateChannelComments('comments')}
                disabled={createBusy}
              >
                Комментарии
              </button>
              <button
                type="button"
                className={`messenger-settings-modal__segment-btn${
                  createChannelComments === 'reactions_only' ? ' messenger-settings-modal__segment-btn--active' : ''
                }`}
                onClick={() => setCreateChannelComments('reactions_only')}
                disabled={createBusy}
              >
                Только реакции
              </button>
            </div>
          </div>
        ) : null}

        <div className="messenger-settings-modal__actions messenger-settings-modal__actions--split messenger-settings-modal__actions--spread">
          <button type="button" className="messenger-settings-modal__cancel" onClick={onClose} disabled={createBusy}>
            Отмена
          </button>
          <button type="button" className="messenger-settings-modal__done" onClick={onSubmit} disabled={createBusy}>
            {createBusy ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
