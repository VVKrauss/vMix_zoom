const RESERVED = new Set([
  'admin',
  'api',
  'dashboard',
  'login',
  'auth',
  'r',
  'room',
  'rooms',
  'messenger',
  'friends',
  'settings',
  'support',
  'www',
  'null',
  'undefined',
])

/** Нормализация для сравнения и сохранения: lower, trim, пробелы → дефис. */
export function normalizeProfileSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/_+/g, '-')
}

/** null — значение валидно (в т.ч. пустая строка = сброс slug). Строка — текст ошибки. */
export function validateProfileSlugInput(raw: string): string | null {
  const t = normalizeProfileSlug(raw)
  if (t.length === 0) return null
  if (t.length < 3) return 'Минимум 3 символа'
  if (t.length > 32) return 'Максимум 32 символа'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t)) {
    return 'Только латиница, цифры и дефис (без дефиса в начале/конце)'
  }
  if (RESERVED.has(t)) return 'Этот адрес зарезервирован'
  return null
}
