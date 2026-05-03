import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationMentionPick } from '../../lib/messengerMentions'
import { listConversationMembersForMentions } from '../../lib/messengerMentions'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function parseMentionQuery(value: string, caret: number): { at: number; query: string } | null {
  const pos = clamp(caret, 0, value.length)
  const head = value.slice(0, pos)
  const at = head.lastIndexOf('@')
  if (at < 0) return null
  const before = at > 0 ? head[at - 1] : ''
  if (before && /[A-Za-z0-9_/-]/.test(before)) return null
  const q = head.slice(at + 1)
  if (!/^[A-Za-z0-9_-]*$/.test(q)) return null
  return { at, query: q }
}

export function MentionAutocomplete({
  conversationId,
  textareaRef,
  value,
  onChange,
  disabled,
}: {
  conversationId: string
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const [members, setMembers] = useState<ConversationMentionPick[]>([])
  const [loadedFor, setLoadedFor] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const lastQueryRef = useRef<{ at: number; query: string } | null>(null)

  useEffect(() => {
    const cid = conversationId.trim()
    if (!cid || loadedFor === cid) return
    setLoadedFor(cid)
    void listConversationMembersForMentions(cid).then((r) => {
      if (r.data) setMembers(r.data)
    })
  }, [conversationId, loadedFor])

  const caret = textareaRef.current?.selectionStart ?? value.length
  const mq = useMemo(() => parseMentionQuery(value, caret), [value, caret])
  lastQueryRef.current = mq

  const filtered = useMemo(() => {
    if (!mq) return []
    const q = mq.query.trim().toLowerCase()
    const arr = members
    if (!q) return arr.slice(0, 12)
    return arr
      .filter((m) => m.profileSlug.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q))
      .slice(0, 12)
  }, [members, mq])

  useEffect(() => {
    setOpen(Boolean(mq && filtered.length > 0 && !disabled))
    setActiveIndex(0)
  }, [mq?.at, mq?.query, filtered.length, disabled])

  const pick = useCallback(
    (m: ConversationMentionPick) => {
      const cur = lastQueryRef.current
      const ta = textareaRef.current
      if (!cur || !ta) return
      const before = value.slice(0, cur.at)
      const after = value.slice(ta.selectionStart ?? value.length)
      const insert = `@${m.profileSlug} `
      const next = `${before}${insert}${after}`
      onChange(next)
      requestAnimationFrame(() => {
        try {
          const p = (before + insert).length
          ta.focus()
          ta.setSelectionRange(p, p)
        } catch {
          /* noop */
        }
      })
      setOpen(false)
    },
    [onChange, textareaRef, value],
  )

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => clamp(i + 1, 0, Math.max(0, filtered.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => clamp(i - 1, 0, Math.max(0, filtered.length - 1)))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const cur = filtered[activeIndex]
        if (!cur) return
        e.preventDefault()
        pick(cur)
      }
    }
    ta.addEventListener('keydown', handler)
    return () => ta.removeEventListener('keydown', handler)
  }, [activeIndex, filtered, open, pick, textareaRef])

  if (!open) return null

  return (
    <div className="mention-autocomplete" role="listbox" aria-label="Упоминания">
      <div className="mention-autocomplete__inner app-scroll" onMouseDown={(e) => e.preventDefault()}>
        {filtered.map((m, idx) => (
          <button
            key={m.userId}
            type="button"
            role="option"
            aria-selected={idx === activeIndex}
            className={`mention-autocomplete__row${idx === activeIndex ? ' mention-autocomplete__row--active' : ''}`}
            onClick={() => pick(m)}
          >
            <span className="mention-autocomplete__avatar" aria-hidden>
              {m.avatarUrl ? <img src={m.avatarUrl} alt="" /> : <span>{(m.displayName || '?').trim().slice(0, 1).toUpperCase()}</span>}
            </span>
            <span className="mention-autocomplete__main">
              <span className="mention-autocomplete__name">{m.displayName}</span>
              <span className="mention-autocomplete__slug">@{m.profileSlug}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

