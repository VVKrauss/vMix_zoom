import type { ClipboardEvent, Dispatch, MutableRefObject, SetStateAction } from 'react'
import { unlockAudioContext } from '../../lib/messengerSound'
import { getMessengerImageAttachments, type DirectMessage } from '../../lib/messenger'
import { MESSENGER_COMPOSER_EMOJIS } from '../../lib/messengerComposerEmojis'
import { truncateMessengerReplySnippet } from '../../lib/messengerUi'
import type { LinkPreview } from '../../lib/linkPreview'
import { AttachmentIcon } from '../icons'
import { MessengerVoiceRecordBtn } from './MessengerVoiceRecordBtn'
import { MessengerReplyMiniThumb } from '../MessengerReplyMiniThumb'
import { ReactionEmojiPopover } from '../ReactionEmojiPopover'
import { DraftLinkPreviewBar } from './DraftLinkPreviewBar'

export type PendingMessengerPhoto = { id: string; file: File; previewUrl: string }

export function MessengerThreadComposer(props: {
  replyTo: DirectMessage | null
  editingMessageId: string | null
  pendingMessengerPhotos: PendingMessengerPhoto[]
  draft: string
  onDraftChange: (value: string) => void
  threadLoading: boolean
  photoUploading: boolean
  sending: boolean
  isMobileMessenger: boolean
  bumpScrollIfPinned: () => void
  onOpenLightbox: (urls: string[], index: number) => void
  onRemovePendingPhoto: (id: string) => void
  draftLinkPreview: LinkPreview | null
  draftLinkPreviewLoading: boolean
  onDismissDraftLinkPreview: () => void
  composerTextareaRef: MutableRefObject<HTMLTextAreaElement | null>
  composerEmojiWrapRef: MutableRefObject<HTMLDivElement | null>
  photoInputRef: MutableRefObject<HTMLInputElement | null>
  onComposerPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  adjustMobileComposerHeight: () => void
  onSend: () => void | Promise<void>
  insertEmojiInDraft: (emoji: string) => void
  onAddPendingPhotoFiles: (files: File[]) => void
  composerEmojiOpen: boolean
  setComposerEmojiOpen: Dispatch<SetStateAction<boolean>>
  onClearReply: () => void
  onCancelEdit: () => void
  voiceUploading?: boolean
  onVoiceRecorded?: (blob: Blob, durationSec: number) => void | Promise<void>
}) {
  const {
    replyTo,
    editingMessageId,
    pendingMessengerPhotos,
    draft,
    onDraftChange,
    threadLoading,
    photoUploading,
    sending,
    isMobileMessenger,
    bumpScrollIfPinned,
    onOpenLightbox,
    onRemovePendingPhoto,
    draftLinkPreview,
    draftLinkPreviewLoading,
    onDismissDraftLinkPreview,
    composerTextareaRef,
    composerEmojiWrapRef,
    photoInputRef,
    onComposerPaste,
    adjustMobileComposerHeight,
    onSend,
    insertEmojiInDraft,
    onAddPendingPhotoFiles,
    composerEmojiOpen,
    setComposerEmojiOpen,
    onClearReply,
    onCancelEdit,
    voiceUploading = false,
    onVoiceRecorded,
  } = props

  return (
    <div className="dashboard-messenger__composer" role="region" aria-label="Новое сообщение">
      {replyTo && !editingMessageId ? (
        <div className="dashboard-messenger__composer-reply">
          <div className="dashboard-messenger__composer-reply-text">
            <span className="dashboard-messenger__composer-reply-label">Ответ</span>{' '}
            <strong>{replyTo.senderNameSnapshot}</strong>
            <span className="dashboard-messenger__composer-reply-snippet">
              {replyTo.kind === 'audio' ? (
                <span>{truncateMessengerReplySnippet(replyTo.body) || 'Голосовое сообщение'}</span>
              ) : replyTo.kind === 'image' ? (
                <>
                  {(() => {
                    const att = getMessengerImageAttachments(replyTo)[0]
                    const tp = att?.thumbPath?.trim() || att?.path?.trim()
                    return tp ? (
                      <MessengerReplyMiniThumb thumbPath={tp} onThumbLayout={bumpScrollIfPinned} />
                    ) : null
                  })()}
                  <span>{truncateMessengerReplySnippet(replyTo.body)}</span>
                </>
              ) : (
                <span>{truncateMessengerReplySnippet(replyTo.body) || '…'}</span>
              )}
            </span>
          </div>
          <button
            type="button"
            className="dashboard-messenger__composer-reply-cancel"
            aria-label="Отменить ответ"
            onClick={onClearReply}
          >
            ✕
          </button>
        </div>
      ) : null}
      {editingMessageId ? (
        <div className="dashboard-messenger__composer-edit-bar">
          <span>Редактирование сообщения</span>
          <button type="button" className="dashboard-messenger__composer-edit-cancel" onClick={onCancelEdit}>
            Отмена
          </button>
        </div>
      ) : null}
      {pendingMessengerPhotos.length > 0 && !editingMessageId ? (
        <div className="dashboard-messenger__pending-photos">
          {pendingMessengerPhotos.map((p, idx) => (
            <div key={p.id} className="dashboard-messenger__pending-photo">
              <button
                type="button"
                className="dashboard-messenger__pending-photo-open"
                title="Открыть"
                aria-label="Открыть изображение"
                onClick={() =>
                  onOpenLightbox(
                    pendingMessengerPhotos.map((x) => x.previewUrl),
                    idx,
                  )
                }
              >
                <img src={p.previewUrl} alt="" />
              </button>
              <button
                type="button"
                className="dashboard-messenger__pending-photo-remove"
                aria-label="Убрать фото"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemovePendingPhoto(p.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {!editingMessageId ? (
        <DraftLinkPreviewBar
          preview={draftLinkPreview}
          loading={draftLinkPreviewLoading}
          onDismiss={onDismissDraftLinkPreview}
        />
      ) : null}
      <div className="dashboard-messenger__composer-main">
        <textarea
          ref={composerTextareaRef}
          className="dashboard-messenger__input"
          rows={isMobileMessenger ? 1 : 3}
          placeholder={editingMessageId ? 'Исправьте текст…' : 'Напиши сообщение…'}
          value={draft}
          disabled={threadLoading || photoUploading || voiceUploading}
          onPaste={onComposerPaste}
          onChange={(e) => {
            onDraftChange(e.target.value)
            if (isMobileMessenger) queueMicrotask(() => adjustMobileComposerHeight())
          }}
          onPointerDown={() => unlockAudioContext()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void onSend()
            }
          }}
        />
        <div className="dashboard-messenger__composer-side">
          <div className="dashboard-messenger__composer-tools" ref={composerEmojiWrapRef}>
            {composerEmojiOpen && !editingMessageId ? (
              <div className="dashboard-messenger__composer-emoji-pop">
                <ReactionEmojiPopover
                  title="Эмодзи"
                  emojis={MESSENGER_COMPOSER_EMOJIS}
                  onClose={() => setComposerEmojiOpen(false)}
                  onPick={(em) => insertEmojiInDraft(em)}
                />
              </div>
            ) : null}
            <button
              type="button"
              className="dashboard-messenger__composer-icon-btn"
              title="Эмодзи"
              aria-label="Вставить эмодзи"
              disabled={threadLoading || Boolean(editingMessageId)}
              onClick={() => setComposerEmojiOpen((v) => !v)}
            >
              😀
            </button>
            <button
              type="button"
              className="dashboard-messenger__composer-icon-btn"
              title="Фото"
              aria-label="Прикрепить фото"
              disabled={threadLoading || photoUploading || voiceUploading || Boolean(editingMessageId)}
              onClick={() => photoInputRef.current?.click()}
            >
              <AttachmentIcon />
            </button>
            {onVoiceRecorded && !editingMessageId ? (
              <MessengerVoiceRecordBtn
                disabled={threadLoading || Boolean(editingMessageId)}
                busy={photoUploading || voiceUploading || sending}
                onRecorded={onVoiceRecorded}
              />
            ) : null}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              className="dashboard-messenger__photo-input"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (files.length === 0) return
                onAddPendingPhotoFiles(files)
              }}
            />
          </div>
          <button
            type="button"
            className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn"
            disabled={
              (!draft.trim() && pendingMessengerPhotos.length === 0) ||
              sending ||
              threadLoading ||
              photoUploading ||
              voiceUploading
            }
            onClick={() => void onSend()}
          >
            {editingMessageId ? 'Сохранить' : 'Отправить'}
          </button>
        </div>
      </div>
      {photoUploading || voiceUploading ? (
        <p className="dashboard-messenger__photo-status" role="status">
          {voiceUploading ? 'Загрузка аудио…' : 'Загрузка фото…'}
        </p>
      ) : null}
    </div>
  )
}
