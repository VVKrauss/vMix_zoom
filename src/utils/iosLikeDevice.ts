/**
 * iPhone / iPad / iPod (в т.ч. iPadOS с desktop UA).
 * Для WebRTC на iOS системный аудио-маршрут (Bluetooth и т.д.) надёжнее,
 * чем exact deviceId из сохранённых настроек с другого устройства.
 */
export function isIosLikeDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  const n = navigator as Navigator & { maxTouchPoints?: number; userAgentData?: { platform?: string } }
  if (n.userAgentData?.platform === 'iOS') return true
  if (navigator.platform === 'MacIntel' && (n.maxTouchPoints ?? 0) > 1) return true
  return false
}
