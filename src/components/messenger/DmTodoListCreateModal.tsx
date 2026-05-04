import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type FocusEvent } from 'react'
import type { DmTodoListItem } from '../../lib/messenger'

const MAX_ITEMS = 10

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export type DmTodoListCreateModalProps = {
  open: boolean
  mode: 'create' | 'edit'
  initialTitle?: string
  initialItems?: DmTodoListItem[]
  onClose: () => void
  onConfirm: (payload: { title: string; items: DmTodoListItem[] }) => void
}

/** Строки для UI: всегда есть «хвостовое» пустое поле после последней непустой (до MAX_ITEMS). */

function autosizeTaskTextarea(el: HTMLTextAreaElement) {
  const cs = window.getComputedStyle(el)
  const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const linePx =
    cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.28 : parseFloat(cs.lineHeight)
  const minOne = Math.ceil(linePx + pad + border)

  el.style.overflow = 'hidden'
  el.style.minHeight = '0'
  el.style.height = '0'
  const sh = el.scrollHeight
  el.style.removeProperty('min-height')
  el.style.height = `${Math.max(sh, minOne)}px`
}

function buildDisplayLines(raw: string[]): string[] {
  const base = raw.length > 0 ? [...raw] : ['']
  let lastFilled = -1
  for (let i = 0; i < base.length; i++) {
    if (base[i]!.trim()) lastFilled = i
  }
  let n = Math.max(lastFilled + 2, 1)
  n = Math.min(n, MAX_ITEMS + 1)
  while (base.length < n) base.push('')
  return base.slice(0, n)
}

function scrollFieldIntoView(e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  const el = e.target
  requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

export function DmTodoListCreateModal(props: DmTodoListCreateModalProps) {
  const { open, mode, initialTitle = '', initialItems, onClose, onConfirm } = props

  const [title, setTitle] = useState('')
  const [lines, setLines] = useState<string[]>([''])
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    if (!open) {
      setKeyboardInset(0)
      return
    }
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => {
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    }
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    sync()
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialItems && initialItems.length > 0) {
      setTitle((initialTitle ?? '').trim())
      setLines(buildDisplayLines(initialItems.map((x) => (typeof x.text === 'string' ? x.text : ''))))
      return
    }
    setTitle('')
    setLines([''])
  }, [open, mode, initialTitle, initialItems])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const displayLines = useMemo(() => buildDisplayLines(lines), [lines])

  useLayoutEffect(() => {
    if (!open) return
    const nodes = document.querySelectorAll<HTMLTextAreaElement>('.dm-todo-create-modal__task-textarea')
    nodes.forEach(autosizeTaskTextarea)
  }, [open, displayLines])

  const setLine = useCallback((index: number, value: string) => {
    setLines((prev) => {
      const next = [...prev]
      while (next.length <= index) next.push('')
      next[index] = value
      return buildDisplayLines(next)
    })
  }, [])

  const handleOk = () => {
    const nonEmpty = displayLines.map((s) => s.trim()).filter(Boolean).slice(0, MAX_ITEMS)
    if (nonEmpty.length === 0) return
    const prev = mode === 'edit' && initialItems?.length ? initialItems : null
    const items: DmTodoListItem[] = nonEmpty.map((text, i) => {
      if (prev && i < prev.length) {
        const p = prev[i]!
        return { id: p.id, text, done: p.done }
      }
      return { id: newId(), text, done: false }
    })
    onConfirm({ title: title.trim(), items })
  }

  if (!open) return null

  const scrollPadBottom = 12 + keyboardInset

  return (
    <div className="messenger-settings-modal-root dm-todo-create-modal-root" role="presentation">
      <button type="button" className="messenger-settings-modal-backdrop" aria-label="Закрыть" onClick={onClose} />
      <div
        className="messenger-settings-modal dm-todo-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dm-todo-modal-title"
      >
        <h2 id="dm-todo-modal-title" className="messenger-settings-modal__title dm-todo-create-modal__head">
          {mode === 'edit' ? 'Редактировать список' : 'Список дел'}
        </h2>
        <div
          className="dm-todo-create-modal__body-scroll app-scroll"
          style={{ paddingBottom: scrollPadBottom }}
        >
          <div className="messenger-settings-modal__section">
            <label className="messenger-settings-modal__label" htmlFor="dm-todo-title">
              Заголовок (необязательно)
            </label>
            <input
              id="dm-todo-title"
              type="text"
              className="dashboard-messenger__input dm-todo-create-modal__input dm-todo-create-modal__title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={scrollFieldIntoView}
              placeholder="Без заголовка"
              maxLength={500}
            />
          </div>
          <div className="messenger-settings-modal__section dm-todo-create-modal__tasks">
            {displayLines.map((value, idx) => (
              <div key={`line-${idx}`} className="dm-todo-create-modal__task-row">
                <label className="messenger-settings-modal__label" htmlFor={`dm-todo-line-${idx}`}>
                  {idx === 0 ? 'Задача' : `Задача ${idx + 1}`}
                </label>
                <textarea
                  id={`dm-todo-line-${idx}`}
                  className="dashboard-messenger__input dm-todo-create-modal__input dm-todo-create-modal__task-textarea"
                  rows={1}
                  value={value}
                  onChange={(e) => setLine(idx, e.target.value)}
                  onFocus={scrollFieldIntoView}
                  placeholder="Текст задачи"
                  maxLength={500}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="dm-todo-create-modal__actions">
          <button type="button" className="dashboard-topbar__action" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="dashboard-topbar__action dashboard-topbar__action--primary" onClick={handleOk}>
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
