import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { unlockAudioContext } from '../../lib/messengerSound'
import { getMessengerImageAttachments, type DirectMessage } from '../../lib/messenger'
import { MESSENGER_COMPOSER_EMOJIS } from '../../lib/messengerComposerEmojis'
import { truncateMessengerReplySnippet } from '../../lib/messengerUi'
import type { LinkPreview } from '../../lib/linkPreview'
import { AttachmentIcon, FiRrIcon, MessengerSendPlaneIcon } from '../icons'
import { MessengerVoiceRecordBtn } from './MessengerVoiceRecordBtn'
import { MessengerReplyMiniThumb } from '../MessengerReplyMiniThumb'
import { ComposerEmojiPopoverPortal } from './ComposerEmojiPopoverPortal'
import { DraftLinkPreviewBar } from './DraftLinkPreviewBar'
import { MentionAutocomplete } from './MentionAutocomplete'

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
  conversationId?: string
  /** ЛС: кнопка вложений открывает полоску с типами вложений. */
  dmAttachStripEnabled?: boolean
  onOpenDmTodoModal?: () => void
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
    conversationId = '',
    dmAttachStripEnabled = false,
    onOpenDmTodoModal,
  } = props

  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceMetaEl, setVoiceMetaEl] = useState<HTMLDivElement | null>(null)
  const [attachStripOpen, setAttachStripOpen] = useState(false)
  const attachStripWrapRef = useRef<HTMLDivElement | null>(null)
  const showVoiceMetaStrip = isMobileMessenger && Boolean(onVoiceRecorded) && !editingMessageId

  const hasComposerSendPayload =
    Boolean(editingMessageId) || draft.trim().length > 0 || pendingMessengerPhotos.length > 0
  const showSendIcon = hasComposerSendPayload && !voiceRecording
  const showMic =
    Boolean(onVoiceRecorded) && !editingMessageId && (!hasComposerSendPayload || voiceRecording)

  const sendDisabled =
    (!draft.trim() && pendingMessengerPhotos.length === 0) ||
    sending ||
    threadLoading ||
    photoUploading ||
    voiceUploading

  useEffect(() => {
    if (voiceRecording) setComposerEmojiOpen(false)
  }, [voiceRecording, setComposerEmojiOpen])

  useEffect(() => {
    if (!attachStripOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachStripOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [attachStripOpen])

  useEffect(() => {
    if (!attachStripOpen) return
    const onPointer = (e: PointerEvent) => {
      const root = attachStripWrapRef.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      setAttachStripOpen(false)
    }
    window.addEventListener('pointerdown', onPointer, true)
    return () => window.removeEventListener('pointerdown', onPointer, true)
  }, [attachStripOpen])

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
              ) : replyTo.kind === 'todo_list' ? (
                <span>{truncateMessengerReplySnippet(replyTo.body) || '📋 Список дел'}</span>
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
      {showVoiceMetaStrip ? (
        <div
          ref={setVoiceMetaEl}
          className="dashboard-messenger__composer-voice-meta dashboard-messenger__composer-voice-meta--strip"
          aria-live="polite"
        />
      ) : null}
      <div ref={attachStripWrapRef} className="dashboard-messenger__composer-attach-slot">
        {attachStripOpen && dmAttachStripEnabled && !editingMessageId ? (
          <>
            <div
              className="dashboard-messenger__composer-attach-backdrop"
              aria-hidden
              onClick={() => setAttachStripOpen(false)}
            />
            <div className="dashboard-messenger__composer-attach-strip" role="menu" aria-label="Вложения">
              <button
                type="button"
                className="dashboard-messenger__composer-attach-tile"
                role="menuitem"
                title="Изображение"
                aria-label="Прикрепить изображение"
                disabled={threadLoading || photoUploading || voiceUploading}
                onClick={() => {
                  setAttachStripOpen(false)
                  photoInputRef.current?.click()
                }}
              >
                <span className="dashboard-messenger__composer-attach-tile-ico" aria-hidden>
                  <FiRrIcon name="camera" />
                </span>
                <span className="dashboard-messenger__composer-attach-tile-label">Фото</span>
              </button>
              {onOpenDmTodoModal ? (
                <button
                  type="button"
                  className="dashboard-messenger__composer-attach-tile"
                  role="menuitem"
                  title="Список дел"
                  aria-label="Список дел"
                  disabled={threadLoading || photoUploading || voiceUploading}
                  onClick={() => {
                    setAttachStripOpen(false)
                    onOpenDmTodoModal()
                  }}
                >
                  <span className="dashboard-messenger__composer-attach-tile-ico" aria-hidden>
                    <FiRrIcon name="list" />
                  </span>
                  <span className="dashboard-messenger__composer-attach-tile-label">Список</span>
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <div
        className={`dashboard-messenger__composer-main dashboard-messenger__composer-main--row${
          voiceRecording && Boolean(onVoiceRecorded) && !editingMessageId
            ? ' dashboard-messenger__composer-main--voice-rec-mobile'
            : ''
        }`}
      >
        {dmAttachStripEnabled && !editingMessageId ? (
          <button
            type="button"
            className={`dashboard-messenger__composer-icon-btn${attachStripOpen ? ' dashboard-messenger__composer-icon-btn--active' : ''}`}
            title="Вложения"
            aria-label="Вложения"
            aria-expanded={attachStripOpen}
            aria-haspopup="menu"
            disabled={threadLoading || photoUploading || voiceUploading}
            onClick={() => setAttachStripOpen((v) => !v)}
          >
            <AttachmentIcon />
          </button>
        ) : (
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
        )}
        <div className="dashboard-messenger__composer-input-wrap">
          {conversationId.trim() ? (
            <MentionAutocomplete
              conversationId={conversationId}
              textareaRef={composerTextareaRef}
              value={draft}
              onChange={onDraftChange}
              disabled={threadLoading || photoUploading || voiceUploading}
            />
          ) : null}
          <textarea
            ref={composerTextareaRef}
            className="dashboard-messenger__input"
            rows={1}
            placeholder={editingMessageId ? 'Исправьте текст…' : 'Напиши сообщение…'}
            value={draft}
            disabled={threadLoading || photoUploading || voiceUploading}
            onPaste={onComposerPaste}
            onChange={(e) => {
              onDraftChange(e.target.value)
              queueMicrotask(() => adjustMobileComposerHeight())
            }}
            onPointerDown={() => unlockAudioContext()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void onSend()
              }
            }}
          />
        </div>
        <div className="dashboard-messenger__composer-trailing">
          <div
            className={`dashboard-messenger__composer-tools${
              voiceRecording && Boolean(onVoiceRecorded) && !editingMessageId
                ? ' dashboard-messenger__composer-tools--voice-rec'
                : ''
            }`}
            ref={composerEmojiWrapRef}
          >
            <ComposerEmojiPopoverPortal
              open={composerEmojiOpen && !editingMessageId}
              anchorRef={composerEmojiWrapRef}
              emojis={MESSENGER_COMPOSER_EMOJIS}
              onClose={() => setComposerEmojiOpen(false)}
              onPick={(em) => insertEmojiInDraft(em)}
            />
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
            {showMic ? (
              <MessengerVoiceRecordBtn
                variant={isMobileMessenger && Boolean(onVoiceRecorded) ? 'mobileEnd' : 'default'}
                metaPortalEl={isMobileMessenger ? voiceMetaEl : undefined}
                disabled={threadLoading || Boolean(editingMessageId)}
                busy={photoUploading || voiceUploading || sending}
                onRecorded={onVoiceRecorded!}
                onRecordingChange={setVoiceRecording}
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
          {showSendIcon ? (
            <button
              type="button"
              className="dashboard-topbar__action dashboard-topbar__action--primary dashboard-messenger__send-btn dashboard-messenger__send-btn--icon"
              title={editingMessageId ? 'Сохранить' : 'Отправить'}
              aria-label={editingMessageId ? 'Сохранить сообщение' : 'Отправить сообщение'}
              disabled={sendDisabled}
              onClick={() => void onSend()}
            >
              {editingMessageId ? <FiRrIcon name="check" /> : <MessengerSendPlaneIcon />}
            </button>
          ) : null}
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
