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

/**
 * Автогенерация ника: после `normalizeProfileSlug` вид `user-<8 hex-символов>`.
 * Смесь времени регистрации и `crypto.getRandomValues` (коллизии добираются повтором в вызывающем коде).
 */
export function buildAutoProfileSlug(nowMs: number = Date.now()): string {
  const buf = new Uint8Array(4)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 256)
  }
  const t = new DataView(new ArrayBuffer(4))
  t.setUint32(0, (nowMs / 1000) >>> 0, false)
  const tv = new Uint8Array(t.buffer)
  for (let i = 0; i < 4; i++) buf[i] ^= tv[i]
  const eight = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
  return normalizeProfileSlug(`user_${eight}`)
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
