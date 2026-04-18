import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { ToastApi } from '../context/ToastContext'

/** Одноразовый toast по строке ошибки и сброс состояния (как общие setError / setInviteError в мессенджере). */
export function useEphemeralErrorToast(
  message: string | null,
  setMessage: Dispatch<SetStateAction<string | null>>,
  toast: ToastApi,
  ms = 3800,
): void {
  useEffect(() => {
    if (!message) return
    toast.push({ tone: 'error', message, ms })
    setMessage(null)
  }, [message, setMessage, toast, ms])
}
