import { useEffect, useRef } from 'react'

export function useDevRenderTrace(name: string, extra?: Record<string, unknown>): void {
  const n = useRef(0)
  n.current += 1

  useEffect(() => {
    if (!import.meta.env.DEV) return
    // eslint-disable-next-line no-console
    console.debug(`[render] ${name} #${n.current}`, extra ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])
}

export function devMark(name: string, payload?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  // eslint-disable-next-line no-console
  console.debug(`[mark] ${name}`, payload ?? {})
}

