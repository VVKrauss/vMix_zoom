import { useEffect, useRef } from 'react'

/** Включить подробные dev-логи: в `.env` задать `VITE_DEV_TRACE=true`. */
export function isDevTraceEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  const v = import.meta.env.VITE_DEV_TRACE
  return v === 'true' || v === '1'
}

export function useDevRenderTrace(name: string, extra?: Record<string, unknown>): void {
  const n = useRef(0)
  n.current += 1

  useEffect(() => {
    if (!isDevTraceEnabled()) return
    // eslint-disable-next-line no-console
    console.debug(`[render] ${name} #${n.current}`, extra ?? {})
  })
}

export function devMark(name: string, payload?: Record<string, unknown>): void {
  if (!isDevTraceEnabled()) return
  // eslint-disable-next-line no-console
  console.debug(`[mark] ${name}`, payload ?? {})
}

