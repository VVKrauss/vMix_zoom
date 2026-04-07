/** Инициалы для заглушки плитки (как в Meet / FaceTime). */
export function initialsFromDisplayName(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]!.charAt(0)
    const b = parts[1]!.charAt(0)
    return (a + b).toUpperCase()
  }
  const s = parts[0]!
  return s.length >= 2 ? s.slice(0, 2).toUpperCase() : s.toUpperCase()
}
