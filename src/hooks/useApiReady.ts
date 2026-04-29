import { useEffect, useState } from 'react'
import { resolveApiBase } from '../api/endpointResolver'

export function useApiReady(): { ready: boolean; apiBase: string | null; error: unknown | null } {
  const [state, setState] = useState<{ ready: boolean; apiBase: string | null; error: unknown | null }>({
    ready: false,
    apiBase: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    resolveApiBase()
      .then((base) => {
        if (cancelled) return
        setState({ ready: true, apiBase: base || null, error: null })
      })
      .catch((e) => {
        if (cancelled) return
        setState({ ready: true, apiBase: null, error: e })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

