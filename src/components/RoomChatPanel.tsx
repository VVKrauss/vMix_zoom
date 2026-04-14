import { useEffect, useRef, useState } from 'react'
import { useUserPeek } from '../context/UserPeekContext'
import type { ContactStatus } from '../lib/socialGraph'
import type { RoomChatMessage } from '../types/roomComms'
import { CHAT_MESSAGE_MAX_LEN } from '../types/roomComms'
import { FiRrIcon, StarIcon } from './icons'

interface Props {
  variant: 'overlay' | 'embed'
  open: boolean
  onClose: () => void
  messages: RoomChatMessage[]
  localPeerId: string
  localUserId?: string | null
  avatarByPeerId?: Record<string, string | null | undefined>
  avatarByUserId?: Record<string, string | null | undefined>
  contactStatuses?: Record<string, ContactStatus>
  onToggleFavoriteUser?: (targetUserId: string, nextFavorite: boolean) => void
  onSend: (text: string) => void
  /** Запретить ввод (например, режим «чат закрыт»). */
  composerLocked?: boolean
  composerLockedHint?: string | null
}

function ChatSendArrowIcon() {
  return <FiRrIcon name="paper-plane" />
}

export function RoomChatPanel({
  variant,
  open,
  onClose,
  messages,
  localPeerId,
  localUserId = null,
  avatarByPeerId = {},
  avatarByUserId = {},
  contactStatuses = {},
  onToggleFavoriteUser,
  onSend,
  composerLocked = false,
  composerLockedHint = null,
}: Props) {
  const { openUserPeek } = useUserPeek()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const canSend = draft.trim().length > 0

  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [open, messages.length])

  const submit = () => {
    if (composerLocked) return
    const trimmed = draft.trim()
    if (!trimmed) return
    onSend(trimmed)
    setDraft('')
  }

  if (!open) return null

  const body = (
    <>
      <div className="room-chat-panel__head">
        <span className="room-chat-panel__title">Чат</span>
        <button type="button" className="room-chat-panel__close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <div ref={listRef} className="room-chat-panel__messages">
        {messages.length === 0 ? (
          <p className="room-chat-panel__empty">Пока нет сообщений</p>
        ) : (
          messages.map((message, index) => {
            if (message.kind === 'system') {
              return (
                <div
                  key={`sys-${message.peerId}-${message.ts}-${index}`}
                  className="room-chat-system"
                  role="status"
                  aria-live="polite"
                >
                  {message.text}
                </div>
              )
            }

            const isOwn =
              (localUserId && message.senderUserId && message.senderUserId === localUserId) ||
              message.peerId === localPeerId
            const status = message.senderUserId ? contactStatuses[message.senderUserId] : undefined
            const canToggleFavorite =
              Boolean(message.senderUserId) &&
              Boolean(onToggleFavoriteUser) &&
              (!localUserId || message.senderUserId !== localUserId)
            const statusLabel = status?.isFriend ? 'друг' : status?.isFavorite ? 'в избранном' : null
            const authorAvatarUrl =
              avatarByPeerId[message.peerId] ??
              (message.senderUserId ? avatarByUserId[message.senderUserId] ?? null : null)
            const showBrandFallback = !authorAvatarUrl && Boolean(message.senderUserId)
            const peekUid = message.senderUserId?.trim() ?? ''

            return (
              <div
                key={`${message.senderUserId ?? message.peerId}-${message.ts}-${index}`}
                className={`room-chat-msg${isOwn ? ' room-chat-msg--own' : ''}${message.kind === 'reaction' ? ' room-chat-msg--reaction' : ''}`}
              >
                <div className="room-chat-msg__meta">
                  <span className="room-chat-msg__author">
                    {peekUid ? (
                      <button
                        type="button"
                        className="room-chat-msg__avatar room-chat-msg__avatar-btn"
                        aria-label={`Профиль: ${message.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          openUserPeek({
                            userId: peekUid,
                            displayName: message.name,
                            avatarUrl: authorAvatarUrl,
                          })
                        }}
                      >
                        {authorAvatarUrl ? (
                          <img src={authorAvatarUrl} alt="" className="room-chat-msg__avatar-img" />
                        ) : showBrandFallback ? (
                          <img src="/logo.png" alt="" className="room-chat-msg__avatar-img room-chat-msg__avatar-img--brand" />
                        ) : (
                          <span className="room-chat-msg__avatar-fallback" />
                        )}
                      </button>
                    ) : (
                      <span className="room-chat-msg__avatar" aria-hidden>
                        {authorAvatarUrl ? (
                          <img src={authorAvatarUrl} alt="" className="room-chat-msg__avatar-img" />
                        ) : showBrandFallback ? (
                          <img src="/logo.png" alt="" className="room-chat-msg__avatar-img room-chat-msg__avatar-img--brand" />
                        ) : (
                          <span className="room-chat-msg__avatar-fallback" />
                        )}
                      </span>
                    )}
                    <span className="room-chat-msg__name-wrap">
                      <span className="room-chat-msg__name">{message.name}</span>
                      {statusLabel ? <span className="room-chat-msg__tag">{statusLabel}</span> : null}
                      {canToggleFavorite ? (
                        <button
                          type="button"
                          className={`room-chat-msg__favorite-btn${status?.isFavorite ? ' room-chat-msg__favorite-btn--active' : ''}`}
                          onClick={() => onToggleFavoriteUser?.(message.senderUserId!, !status?.isFavorite)}
                          title={status?.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                          aria-label={status?.isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                        >
                          <StarIcon filled={status?.isFavorite === true} />
                        </button>
                      ) : null}
                    </span>
                  </span>
                  <span className="room-chat-msg__time">
                    {new Date(message.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {message.kind === 'reaction' ? (
                  <div className="room-chat-msg__reaction-emoji" aria-hidden>
                    {message.text}
                  </div>
                ) : (
                  <div className="room-chat-msg__text">{message.text}</div>
                )}
              </div>
            )
          })
        )}
      </div>
      <div
        className={`room-chat-panel__composer${composerLocked ? ' room-chat-panel__composer--locked' : ''}`}
      >
        {composerLocked && composerLockedHint ? (
          <p className="room-chat-panel__composer-hint" role="status">
            {composerLockedHint}
          </p>
        ) : null}
        <textarea
          className="room-chat-panel__input"
          rows={2}
          maxLength={CHAT_MESSAGE_MAX_LEN}
          placeholder={composerLocked ? 'Отправка недоступна' : 'Сообщение…'}
          value={draft}
          disabled={composerLocked}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (draft.trim()) submit()
            }
          }}
        />
        <button
          type="button"
          className="room-chat-panel__send-btn"
          onClick={submit}
          disabled={composerLocked || !canSend}
          title="Отправить"
          aria-label="Отправить сообщение"
        >
          <ChatSendArrowIcon />
        </button>
      </div>
    </>
  )

  const panel =
    variant === 'embed' ? (
      <div role="complementary" aria-label="Чат комнаты" className="room-chat-panel room-chat-panel--embed">
        {body}
      </div>
    ) : (
      <aside className="room-chat-panel" aria-label="Чат комнаты">
        {body}
      </aside>
    )

  if (variant === 'embed') return panel

  return (
    <>
      <button type="button" className="room-chat-backdrop" aria-label="Закрыть чат" onClick={onClose} />
      {panel}
    </>
  )
}
