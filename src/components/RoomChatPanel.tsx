import { useEffect, useRef, useState } from 'react'
import type { RoomChatMessage } from '../types/roomComms'
import { CHAT_MESSAGE_MAX_LEN } from '../types/roomComms'

interface Props {
  /** Оверлей с затемнением или колонка справа в разметке комнаты */
  variant: 'overlay' | 'embed'
  open: boolean
  onClose: () => void
  messages: RoomChatMessage[]
  localPeerId: string
  onSend: (text: string) => void
}

function ChatSendArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}

export function RoomChatPanel({ variant, open, onClose, messages, localPeerId, onSend }: Props) {
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
    const t = draft.trim()
    if (!t) return
    onSend(t)
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
            messages.map((m, i) => (
            <div
              key={`${m.peerId}-${m.ts}-${i}`}
              className={`room-chat-msg${m.peerId === localPeerId ? ' room-chat-msg--own' : ''}${m.kind === 'reaction' ? ' room-chat-msg--reaction' : ''}`}
            >
              <div className="room-chat-msg__meta">
                <span className="room-chat-msg__name">{m.name}</span>
                <span className="room-chat-msg__time">
                  {new Date(m.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {m.kind === 'reaction' ? (
                <div className="room-chat-msg__reaction-emoji" aria-hidden>
                  {m.text}
                </div>
              ) : (
                <div className="room-chat-msg__text">{m.text}</div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="room-chat-panel__composer">
        <textarea
          className="room-chat-panel__input"
          rows={2}
          maxLength={CHAT_MESSAGE_MAX_LEN}
          placeholder="Сообщение…"
          value={draft}
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
          disabled={!canSend}
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
