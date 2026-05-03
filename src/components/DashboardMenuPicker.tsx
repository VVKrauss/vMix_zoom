import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type DashboardMenuOption<T extends string> = { value: T; label: string }

function labelFor<T extends string>(options: DashboardMenuOption<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value
}

/**
 * Выпадающий список в стиле «Вид по умолчанию» (кнопка + портал-меню).
 */
export function DashboardMenuPicker<T extends string>({
  value,
  onChange,
  options,
  ariaLabelPrefix,
  modifierClass = '',
}: {
  value: T
  onChange: (v: T) => void
  options: DashboardMenuOption<T>[]
  /** Например «Фильтр» → aria-label «Фильтр: Все» */
  ariaLabelPrefix: string
  /** Доп. класс на корень, напр. admin-role-picker--dashboard-filters */
  modifierClass?: string
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
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target =
        'touches' in e && e.touches[0] ? (e.touches[0]!.target as Node) : ((e as MouseEvent).target as Node)
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const touchOpts: AddEventListenerOptions = { capture: true, passive: true }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, touchOpts)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown, touchOpts)
    }
  }, [open])

  const onPick = (v: T) => {
    onChange(v)
    setOpen(false)
  }

  const rootClass = ['admin-role-picker', modifierClass.trim()].filter(Boolean).join(' ')

  const menu =
    open && menuPlace ? (
      <ul
        ref={menuRef}
        className="admin-role-picker__menu admin-role-picker__menu--portal app-scroll"
        style={{ top: menuPlace.top, right: menuPlace.right }}
        role="listbox"
      >
        {options.map((opt) => {
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
    <div className={rootClass}>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-role-picker__trigger${open ? ' admin-role-picker__trigger--open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabelPrefix}: ${labelFor(options, value)}`}
      >
        {labelFor(options, value)}
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
