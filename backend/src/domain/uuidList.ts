/** Validates a list of string ids for SQL `any($n::uuid[])`; max length enforced. */
export function assertUuidList(value: unknown, max = 200): string[] {
  const arr = Array.isArray(value) ? value : []
  const out: string[] = []
  for (const x of arr) {
    const s = typeof x === 'string' ? x.trim() : String(x ?? '').trim()
    if (!s) continue
    out.push(s)
    if (out.length > max) throw Object.assign(new Error('too_many_ids'), { statusCode: 400 })
  }
  return out
}
