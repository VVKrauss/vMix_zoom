/** Форматирует длительность в секундах для подписей в кабинете (рус.). */
export function formatDurationRuSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return `${s} с`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return rs > 0 ? `${m} мин ${rs} с` : `${m} мин`
  const h = Math.floor(m / 60)
  const rm = m % 60
  if (h < 48) return rm > 0 ? `${h} ч ${rm} мин` : `${h} ч`
  const d = Math.floor(h / 24)
  const rh = h % 24
  return rh > 0 ? `${d} д ${rh} ч` : `${d} д`
}
