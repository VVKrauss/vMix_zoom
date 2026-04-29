/**
 * Текст для UI: куда подключается клиент (учёт Vite proxy в dev).
 */
export function getSignalingDisplayLines(): { primary: string; secondary?: string } {
  const trim = (s: unknown) => String(s ?? '').trim().replace(/\/$/, '')
  const configured =
    trim(import.meta.env.VITE_API_FALLBACK) || trim(import.meta.env.VITE_API_BASE) || trim(import.meta.env.VITE_SIGNALING_URL)
  const fallback = 'https://proxy.redflow.online'

  if (import.meta.env.DEV) {
    const proxyTarget = configured || fallback
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
    return {
      primary: origin,
      secondary: `Через прокси Vite: /socket.io и /api → ${proxyTarget}`,
    }
  }

  if (configured) {
    return { primary: configured }
  }

  return {
    primary: '(не задан VITE_API_FALLBACK / VITE_API_BASE / VITE_SIGNALING_URL)',
    secondary: 'Соберите фронт с переменной VITE_API_FALLBACK (или VITE_API_BASE) на нужный хост.',
  }
}
