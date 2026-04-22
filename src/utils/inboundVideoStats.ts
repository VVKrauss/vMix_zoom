/** Снимок для дельты между двумя getStats (входящее видео с SFU). */
export type InboundVideoStatsSample = {
  t: number
  bytesReceived: number
  packetsReceived: number
  packetsLost: number
}

export type InboundVideoQuality = {
  level: 1 | 2 | 3 | 4 | 5
  bitrateBps: number
  fractionLost: number
  jitterMs: number | null
}

const EMA_ALPHA = 0.35

export function pickInboundVideoRtp(report: RTCStatsReport): RTCInboundRtpStreamStats | null {
  for (const s of report.values()) {
    if (s.type !== 'inbound-rtp') continue
    const v = s as RTCInboundRtpStreamStats & { mediaType?: string }
    if (v.kind === 'video' || v.mediaType === 'video') return v as RTCInboundRtpStreamStats
  }
  return null
}

export function snapshotInboundRtp(cur: RTCInboundRtpStreamStats, now: number): InboundVideoStatsSample {
  return {
    t: now,
    bytesReceived: Number(cur.bytesReceived ?? 0),
    packetsReceived: Number(cur.packetsReceived ?? 0),
    packetsLost: Number(cur.packetsLost ?? 0),
  }
}

export function deltaFromSamples(
  cur: RTCInboundRtpStreamStats,
  prev: InboundVideoStatsSample | undefined,
  now: number,
): { bitrateBps: number; fractionLost: number; jitterMs: number | null } | null {
  const bytes = Number(cur.bytesReceived ?? 0)
  const pr = Number(cur.packetsReceived ?? 0)
  const pl = Number(cur.packetsLost ?? 0)
  const jitterSec = cur.jitter != null ? Number(cur.jitter) : null

  if (!prev) return null

  const dt = (now - prev.t) / 1000
  if (dt < 0.25 || dt > 30) return null

  const dBytes = bytes - prev.bytesReceived
  const bitrateBps = (8 * Math.max(0, dBytes)) / dt

  const dPr = pr - prev.packetsReceived
  const dPl = pl - prev.packetsLost
  const denom = dPr + dPl
  const fractionLost = denom > 0 ? Math.min(1, Math.max(0, dPl / denom)) : 0

  const jitterMs = jitterSec != null && Number.isFinite(jitterSec) ? jitterSec * 1000 : null

  return { bitrateBps, fractionLost, jitterMs }
}

export function applyEma(
  peerId: string,
  map: Map<string, { bitrateBps: number; fractionLost: number }>,
  br: number,
  lf: number,
): { bitrateBps: number; fractionLost: number } {
  const prev = map.get(peerId)
  if (!prev) {
    const first = { bitrateBps: br, fractionLost: lf }
    map.set(peerId, first)
    return first
  }
  const next = {
    bitrateBps: EMA_ALPHA * br + (1 - EMA_ALPHA) * prev.bitrateBps,
    fractionLost: EMA_ALPHA * lf + (1 - EMA_ALPHA) * prev.fractionLost,
  }
  map.set(peerId, next)
  return next
}

/** Inbound video getStats по участнику: префикс ключа EMA инкапсулирован здесь. */
export function applyInboundRecvVideoEma(
  anchorPeerId: string,
  map: Map<string, { bitrateBps: number; fractionLost: number }>,
  br: number,
  lf: number,
): { bitrateBps: number; fractionLost: number } {
  return applyEma(`__in_${anchorPeerId}`, map, br, lf)
}

/** Локальный uplink (камера): фиксированный ключ EMA. */
export function applyLocalUplinkVideoEma(
  map: Map<string, { bitrateBps: number; fractionLost: number }>,
  br: number,
  lf: number,
): { bitrateBps: number; fractionLost: number } {
  return applyEma('__local__', map, br, lf)
}

/** Уровень 5: > 2 Мбит/с при умеренных потерях; штраф за loss / низкий битрейт. */
export function bitrateLossToLevel(bitrateBps: number, fractionLost: number): 1 | 2 | 3 | 4 | 5 {
  let base: 1 | 2 | 3 | 4 | 5 = 1
  if (bitrateBps >= 2_000_000) base = 5
  else if (bitrateBps >= 1_100_000) base = 4
  else if (bitrateBps >= 550_000) base = 3
  else if (bitrateBps >= 180_000) base = 2

  let cap: 1 | 2 | 3 | 4 | 5 = 5
  if (fractionLost > 0.14) cap = 1
  else if (fractionLost > 0.09) cap = 2
  else if (fractionLost > 0.05) cap = 3
  else if (fractionLost > 0.025) cap = 4

  return (Math.min(base, cap) as 1 | 2 | 3 | 4 | 5)
}

export function buildQuality(
  bitrateBps: number,
  fractionLost: number,
  jitterMs: number | null,
): InboundVideoQuality {
  return {
    level: bitrateLossToLevel(bitrateBps, fractionLost),
    bitrateBps,
    fractionLost,
    jitterMs,
  }
}
