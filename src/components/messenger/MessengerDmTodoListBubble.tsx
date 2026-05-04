import { useCallback, useState } from 'react'
import type { DirectMessage, DmTodoListItem } from '../../lib/messenger'
import { updateDirectMessageTodoList } from '../../lib/messenger'

export function MessengerDmTodoListBubble(props: {
  message: DirectMessage
  conversationId: string
  onAfterPatch?: () => void
}) {
  const { message, conversationId, onAfterPatch } = props
  const tl = message.meta?.todo_list
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const persist = useCallback(
    async (next: { title: string; items: DmTodoListItem[] }) => {
      const cid = conversationId.trim()
      const mid = message.id.trim()
      if (!cid || !mid || mid.startsWith('local-')) return
      setBusy(true)
      setErr(null)
      const { error } = await updateDirectMessageTodoList(cid, mid, next)
      setBusy(false)
      if (error) {
        setErr(error)
        return
      }
      onAfterPatch?.()
    },
    [conversationId, message.id, onAfterPatch],
  )

  const toggleDone = (id: string) => {
    if (!tl?.items?.length || busy) return
    const title = tl.title?.trim() ?? ''
    const items = tl.items.map((it) => (it.id === id ? { ...it, done: !it.done } : it))
    void persist({ title, items })
  }

  if (!tl?.items?.length) {
    return <span className="messenger-message-img-missing">Список недоступен</span>
  }

  const title = tl.title?.trim()

  return (
    <div className="messenger-todo-list">
      {title ? <div className="messenger-todo-list__title">{title}</div> : null}
      <ul className="messenger-todo-list__ul">
        {tl.items.map((it) => (
          <li key={it.id} className="messenger-todo-list__li">
            <label className="messenger-todo-list__row">
              <input
                type="checkbox"
                className="messenger-todo-list__check"
                checked={Boolean(it.done)}
                disabled={busy}
                onChange={() => toggleDone(it.id)}
              />
              <span className={it.done ? 'messenger-todo-list__text messenger-todo-list__text--done' : 'messenger-todo-list__text'}>
                {it.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {err ? (
        <p className="messenger-todo-list__err" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  )
}
