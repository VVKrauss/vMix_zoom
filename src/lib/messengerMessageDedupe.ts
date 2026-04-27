import type { DirectMessage } from './messenger'

function toTimeMs(iso: string | undefined | null): number {
  if (!iso) return NaN
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : NaN
}

function kindRank(m: DirectMessage): number {
  if (m.kind === 'reaction') return 0
  if (m.kind === 'system') return 1
  return 2
}

/**
 * If the backend (or a legacy cache) ever returns the same `id` twice, keep a single
 * "best" row deterministically. This should be rare, but it breaks React keys and
 * our timeline de-dupe diagnostics.
 */
export function dedupeDirectMessagesByIdStable(messages: DirectMessage[]): DirectMessage[] {
  const byId = new Map<string, DirectMessage>()
  for (const m of messages) {
    const id = (m.id || '').trim()
    if (!id) continue
    const prev = byId.get(id)
    if (!prev) {
      byId.set(id, m)
      continue
    }
    const pr = kindRank(prev)
    const nr = kindRank(m)
    if (nr > pr) {
      byId.set(id, m)
      continue
    }
    if (nr < pr) {
      continue
    }

    const pt = toTimeMs(prev.createdAt)
    const nt = toTimeMs(m.createdAt)
    if (Number.isFinite(nt) && (!Number.isFinite(pt) || nt > pt)) {
      byId.set(id, m)
      continue
    }
    if (Number.isFinite(pt) && (!Number.isFinite(nt) || nt < pt)) {
      continue
    }

    const pe = toTimeMs(prev.editedAt)
    const ne = toTimeMs(m.editedAt)
    if (Number.isFinite(ne) && (!Number.isFinite(pe) || ne > pe)) {
      byId.set(id, m)
      continue
    }
    if (Number.isFinite(pe) && (!Number.isFinite(ne) || ne < pe)) {
      continue
    }

    // Stable tie-break: prefer lexicographically greater id (should never happen) — keep the newer object shape last seen.
    byId.set(id, m)
  }
  // Preserve original chronological order as much as possible: iterate in input order, emit first-seen id order.
  const out: DirectMessage[] = []
  const seen = new Set<string>()
  for (const m of messages) {
    const id = (m.id || '').trim()
    if (!id) continue
    if (seen.has(id)) continue
    const chosen = byId.get(id)
    if (!chosen) continue
    seen.add(id)
    out.push(chosen)
  }
  return out
}
