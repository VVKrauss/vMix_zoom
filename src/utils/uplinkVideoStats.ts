/**
 * Качество исходящего видео к SFU: outbound-rtp (битрейт) + remote-inbound-rtp
 * (RTCP RR от приёмника — потери/джиттер на пути клиент → сервер).
 */

/** Подмножество RTCRemoteInboundRtpStreamStats (в @types/dom не везде экспортируется). */
export type RemoteInboundRtpLite = {
  type: 'remote-inbound-rtp'
  packetsReceived?: number
  packetsLost?: number
  jitter?: number
}

export type UplinkVideoStatsSample = {
  t: number
  bytesSent: number
  remotePacketsReceived: number
  remotePacketsLost: number
}

export function pickUplinkVideoPair(report: RTCStatsReport): {
  outbound: RTCOutboundRtpStreamStats
  remoteInbound: RemoteInboundRtpLite | null
} | null {
  let outbound: RTCOutboundRtpStreamStats | null = null
  for (const s of report.values()) {
    if (s.type !== 'outbound-rtp') continue
    const v = s as RTCOutboundRtpStreamStats & { mediaType?: string }
    if (v.kind === 'video' || v.mediaType === 'video') {
      outbound = v as RTCOutboundRtpStreamStats
      break
    }
  }
  if (!outbound) return null

  const rid = outbound.remoteId
  if (!rid) return { outbound, remoteInbound: null }

  const linked = report.get(rid)
  if (!linked || linked.type !== 'remote-inbound-rtp') {
    return { outbound, remoteInbound: null }
  }

  return {
    outbound,
    remoteInbound: linked as RemoteInboundRtpLite,
  }
}

export function deltaUplinkFromSamples(
  outbound: RTCOutboundRtpStreamStats,
  remoteInbound: RemoteInboundRtpLite | null,
  prev: UplinkVideoStatsSample | undefined,
  now: number,
): { bitrateBps: number; fractionLost: number; jitterMs: number | null } | null {
  const bytesSent = Number(outbound.bytesSent ?? 0)
  const pr = remoteInbound != null ? Number(remoteInbound.packetsReceived ?? 0) : 0
  const pl = remoteInbound != null ? Number(remoteInbound.packetsLost ?? 0) : 0
  const jitterSec =
    remoteInbound != null && remoteInbound.jitter != null ? Number(remoteInbound.jitter) : null

  if (!prev) return null

  const dt = (now - prev.t) / 1000
  if (dt < 0.25 || dt > 30) return null

  const dBytes = bytesSent - prev.bytesSent
  const bitrateBps = (8 * Math.max(0, dBytes)) / dt

  let fractionLost = 0
  if (remoteInbound != null) {
    const dPr = pr - prev.remotePacketsReceived
    const dPl = pl - prev.remotePacketsLost
    const denom = dPr + dPl
    fractionLost = denom > 0 ? Math.min(1, Math.max(0, dPl / denom)) : 0
  }

  const jitterMs =
    jitterSec != null && Number.isFinite(jitterSec) ? jitterSec * 1000 : null

  return { bitrateBps, fractionLost, jitterMs }
}

export function sampleFromUplinkPair(
  outbound: RTCOutboundRtpStreamStats,
  remoteInbound: RemoteInboundRtpLite | null,
  now: number,
): UplinkVideoStatsSample {
  const bytesSent = Number(outbound.bytesSent ?? 0)
  const remotePacketsReceived =
    remoteInbound != null ? Number(remoteInbound.packetsReceived ?? 0) : 0
  const remotePacketsLost = remoteInbound != null ? Number(remoteInbound.packetsLost ?? 0) : 0
  return { t: now, bytesSent, remotePacketsReceived, remotePacketsLost }
}
