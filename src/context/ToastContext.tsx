import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export type ToastTone = 'info' | 'success' | 'warning' | 'error'

export type ToastItem = {
  id: string
  tone: ToastTone
  title?: string | null
  message: string
  ms: number
}

type ToastApi = {
  push: (t: Omit<ToastItem, 'id'>) => void
  remove: (id: string) => void
  clear: () => void
}

const ToastCtx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const tm = timersRef.current.get(id)
    if (tm != null) {
      window.clearTimeout(tm)
      timersRef.current.delete(id)
    }
  }, [])

  const clear = useCallback(() => {
    setItems([])
    for (const tm of timersRef.current.values()) window.clearTimeout(tm)
    timersRef.current.clear()
  }, [])

  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const next: ToastItem = { ...t, id }
      setItems((prev) => [next, ...prev].slice(0, 4))
      const ms = Math.max(1200, Math.min(t.ms, 20_000))
      const tm = window.setTimeout(() => remove(id), ms)
      timersRef.current.set(id, tm)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(() => ({ push, remove, clear }), [push, remove, clear])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={remove} />
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx)
  if (!v) throw new Error('useToast must be used within ToastProvider')
  return v
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss: (id: string) => void
}) {
  return (
    <div className="app-toast-viewport" role="region" aria-label="Уведомления">
      {items.map((t) => (
        <div key={t.id} className={`app-toast app-toast--${t.tone}`} role="status" aria-live="polite">
          <div className="app-toast__main">
            {t.title ? <div className="app-toast__title">{t.title}</div> : null}
            <div className="app-toast__msg">{t.message}</div>
          </div>
          <button
            type="button"
            className="app-toast__close"
            aria-label="Закрыть уведомление"
            onClick={() => onDismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

