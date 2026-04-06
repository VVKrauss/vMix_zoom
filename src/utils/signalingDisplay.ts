/**
 * Текст для UI: куда подключается клиент (учёт Vite proxy в dev).
 */
export function getSignalingDisplayLines(): { primary: string; secondary?: string } {
  const configured = String(import.meta.env.VITE_SIGNALING_URL ?? '').trim().replace(/\/$/, '')
  const fallback = 'https://s.redflow.online'

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
    primary: '(не задан VITE_SIGNALING_URL)',
    secondary: 'Соберите фронт с переменной VITE_SIGNALING_URL на ваш signaling.',
  }
}
