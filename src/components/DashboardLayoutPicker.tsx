import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { StoredLayoutMode } from '../config/roomUiStorage'

const OPTIONS: { value: StoredLayoutMode; label: string }[] = [
  { value: 'pip', label: 'Картинка в картинке' },
  { value: 'grid', label: 'Плитки' },
  { value: 'speaker', label: 'Спикер' },
]

function optionLabel(mode: StoredLayoutMode): string {
  return OPTIONS.find((o) => o.value === mode)?.label ?? mode
}

export function DashboardLayoutPicker({
  value,
  onChange,
}: {
  value: StoredLayoutMode
  onChange: (v: StoredLayoutMode) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const [menuPlace, setMenuPlace] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setMenuPlace(null)
      return
    }
    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPlace({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const onPick = (v: StoredLayoutMode) => {
    onChange(v)
    setOpen(false)
  }

  const menu =
    open && menuPlace ? (
      <ul
        ref={menuRef}
        className="admin-role-picker__menu admin-role-picker__menu--portal"
        style={{ top: menuPlace.top, right: menuPlace.right }}
        role="listbox"
      >
        {OPTIONS.map((opt) => {
          const active = opt.value === value
          return (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={`admin-role-picker__option${active ? ' admin-role-picker__option--active' : ''}`}
                onClick={() => onPick(opt.value)}
              >
                {opt.label}
              </button>
            </li>
          )
        })}
      </ul>
    ) : null

  return (
    <div className="admin-role-picker admin-role-picker--dashboard-layout">
      <button
        ref={triggerRef}
        type="button"
        className={`admin-role-picker__trigger${open ? ' admin-role-picker__trigger--open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Вид по умолчанию: ${optionLabel(value)}`}
      >
        {optionLabel(value)}
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
