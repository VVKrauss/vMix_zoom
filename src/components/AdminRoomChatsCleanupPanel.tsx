import { useState } from 'react'
import { adminPurgeStaleRoomChats } from '../lib/chatArchive'

export function AdminRoomChatsCleanupPanel() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setMessage(null)
    setError(null)
    const res = await adminPurgeStaleRoomChats()
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setMessage(`Удалено записей чатов комнат: ${res.deleted}.`)
  }

  return (
    <section className="dashboard-section admin-room-chats-cleanup">
      <h2 className="dashboard-section__subtitle">Чаты комнат</h2>
      <p className="dashboard-section__hint">
        Удаляются только диалоги с типом «комната»: без единого сообщения или без ни одного участника в
        <code className="admin-dashboard-code"> chat_conversation_members</code> (например, все убрали запись у себя,
        а сообщений не было).
      </p>
      <p className="dashboard-section__hint">
        Диалоги с историей сообщений и хотя бы одним участником не затрагиваются.
      </p>
      <button type="button" className="join-btn" disabled={busy} onClick={() => void run()}>
        {busy ? 'Выполняется…' : 'Очистить пустые и сироты'}
      </button>
      {message ? <p className="admin-room-chats-cleanup__ok" role="status">{message}</p> : null}
      {error ? <p className="join-error admin-room-chats-cleanup__err">{error}</p> : null}
    </section>
  )
}
