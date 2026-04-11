import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrandLogoLoader } from './BrandLogoLoader'
import { appendDirectMessage, ensureDirectConversationWithUser } from '../lib/messenger'
import { listMyContacts, type ContactCard } from '../lib/socialGraph'

type Props = {
  open: boolean
  onClose: () => void
  /** Полная ссылка на комнату (как из «Скопировать ссылку»). */
  roomInviteUrl: string
  /** ID комнаты для подписи в тексте. */
  roomId: string
  /** Auth user id — не показывать в списке (обычно вы и уже подключённые). */
  excludeUserIds: string[]
  onSent?: (ok: number, fail: number) => void
}

function buildInviteMessage(url: string, roomId: string): string {
  return `Приглашаю в комнату «${roomId}». Перейти: ${url}`
}

export function RoomInviteFriendsModal({
  open,
  onClose,
  roomInviteUrl,
  roomId,
  excludeUserIds,
  onSent,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [friends, setFriends] = useState<ContactCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const excludeSet = useMemo(() => new Set(excludeUserIds.map((id) => id.trim()).filter(Boolean)), [excludeUserIds])

  const loadFriends = useCallback(() => {
    setLoading(true)
    setError(null)
    void listMyContacts().then((res) => {
      setLoading(false)
      if (res.error) {
        setError(res.error)
        setFriends([])
        return
      }
      const rows = (res.data ?? []).filter((c) => c.isFriend && !excludeSet.has(c.targetUserId))
      setFriends(rows)
    })
  }, [excludeSet])

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    loadFriends()
  }, [open, loadFriends])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    if (selected.size === 0 || sending) return
    const ids = Array.from(selected)
    const body = buildInviteMessage(roomInviteUrl, roomId.trim())
    setSending(true)
    setError(null)
    let ok = 0
    let fail = 0
    for (const targetUserId of ids) {
      const friend = friends.find((f) => f.targetUserId === targetUserId)
      const ensured = await ensureDirectConversationWithUser(
        targetUserId,
        friend?.displayName?.trim() || null,
      )
      if (ensured.error || !ensured.data) {
        fail += 1
        continue
      }
      const sent = await appendDirectMessage(ensured.data, body)
      if (sent.error) fail += 1
      else ok += 1
    }
    setSending(false)
    onSent?.(ok, fail)
    onClose()
  }

  if (!open) return null

  return (
    <div className="confirm-dialog-root">
      <button type="button" className="confirm-dialog-backdrop" aria-label="Закрыть" onClick={() => !sending && onClose()} />
      <div
        className="confirm-dialog room-invite-friends-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-invite-friends-title"
      >
        <h2 id="room-invite-friends-title" className="confirm-dialog__title">
          Пригласить из контактов
        </h2>
        <p className="confirm-dialog__msg room-invite-friends-modal__intro">
          Выберите друзей — им уйдёт сообщение в личный чат со ссылкой на эту комнату.
        </p>

        {loading ? (
          <div className="room-invite-friends-modal__loading" aria-label="Загрузка списка…">
            <BrandLogoLoader size={48} />
          </div>
        ) : null}

        {!loading && error ? <p className="join-error room-invite-friends-modal__err">{error}</p> : null}

        {!loading && !error && friends.length === 0 ? (
          <p className="room-invite-friends-modal__empty">Нет друзей для приглашения (или все уже в комнате).</p>
        ) : null}

        {!loading && !error && friends.length > 0 ? (
          <ul className="room-invite-friends-modal__list" aria-label="Друзья">
            {friends.map((f) => {
              const checked = selected.has(f.targetUserId)
              return (
                <li key={f.targetUserId}>
                  <label className="room-invite-friends-modal__row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(f.targetUserId)}
                      disabled={sending}
                    />
                    <span className="room-invite-friends-modal__avatar" aria-hidden>
                      {f.avatarUrl ? (
                        <img src={f.avatarUrl} alt="" />
                      ) : (
                        <span>{f.displayName.charAt(0).toUpperCase()}</span>
                      )}
                    </span>
                    <span className="room-invite-friends-modal__name">{f.displayName}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="confirm-dialog__actions room-invite-friends-modal__actions">
          <button type="button" className="confirm-dialog__btn confirm-dialog__btn--secondary" disabled={sending} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--primary"
            disabled={sending || selected.size === 0 || friends.length === 0}
            onClick={() => void handleSend()}
          >
            {sending ? 'Отправка…' : `Отправить${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
