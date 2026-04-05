import type { ProducerDescriptor } from '../types'

/** Для видео экрана с отдельным peerId — id участника-камеры (хозяин плитки в UI). */
export function ownerPeerFromDescriptor(p: ProducerDescriptor): string | undefined {
  if (typeof p.ownerPeerId === 'string' && p.ownerPeerId.trim()) return p.ownerPeerId.trim()
  const v = p.appData?.ownerPeerId
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function descriptorVideoSource(p: ProducerDescriptor): 'camera' | 'screen' | undefined {
  if (p.videoSource) return p.videoSource
  const src = p.appData?.source
  if (src === 'screen' || src === 'camera') return src
  return undefined
}

/** Куда отнести video producer: экран — второй слот при уже занятой камере. */
export function resolveVideoProducerRole(
  producer: ProducerDescriptor,
  hasCameraStream: boolean,
): 'camera' | 'screen' {
  const t = descriptorVideoSource(producer)
  if (t === 'screen') return 'screen'
  if (t === 'camera') return 'camera'
  return hasCameraStream ? 'screen' : 'camera'
}

/** Плитка участника в UI: владелец камеры, либо peerId продюсера (если owner не задан). */
export function videoAnchorPeerId(p: ProducerDescriptor): string {
  const owner = ownerPeerFromDescriptor(p)
  return owner ?? p.peerId
}

/**
 * Роль видео при consume: если бэкенд выдаёт отдельный peerId для экрана и ownerPeerId —
 * без appData это экран; иначе эвристика «второй video = screen».
 */
export function resolveConsumeVideoRole(
  producer: ProducerDescriptor,
  hasCameraStream: boolean,
): 'camera' | 'screen' {
  const src = descriptorVideoSource(producer)
  const owner = ownerPeerFromDescriptor(producer)
  const separateScreenPeer = Boolean(owner && producer.peerId !== owner)
  if (src === 'screen' || separateScreenPeer) return 'screen'
  if (src === 'camera') return 'camera'
  return resolveVideoProducerRole(producer, hasCameraStream)
}
