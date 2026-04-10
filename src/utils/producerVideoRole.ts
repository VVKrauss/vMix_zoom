import type { ProducerDescriptor } from '../types'

/** Для видео экрана с отдельным peerId — id участника-камеры (хозяин плитки в UI). */
export function ownerPeerFromDescriptor(p: ProducerDescriptor): string | undefined {
  if (typeof p.ownerPeerId === 'string' && p.ownerPeerId.trim()) return p.ownerPeerId.trim()
  const v = p.appData?.ownerPeerId
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function descriptorVideoSource(
  p: ProducerDescriptor,
): 'camera' | 'screen' | 'vmix' | 'studio_program' | undefined {
  if (p.appData?.studioPreview === true || p.appData?.source === 'studio_preview') return 'studio_program'
  if (p.videoSource) return p.videoSource
  const src = p.appData?.source
  if (src === 'screen' || src === 'camera' || src === 'vmix' || src === 'studio_program') return src
  return undefined
}

export function isVmixProducer(p: ProducerDescriptor): boolean {
  return descriptorVideoSource(p) === 'vmix' || p.name === 'vMix'
}

/** Куда отнести video producer: экран — второй слот при уже занятой камере. */
export function resolveVideoProducerRole(
  producer: ProducerDescriptor,
  hasCameraStream: boolean,
): 'camera' | 'screen' {
  const t = descriptorVideoSource(producer)
  if (t === 'vmix') return 'camera'
  /** В соло/эвристике студия идёт в «экранный» слот, но в комнате — отдельный studioProgramStream. */
  if (t === 'studio_program') return 'screen'
  if (t === 'screen') return 'screen'
  if (t === 'camera') return 'camera'
  return hasCameraStream ? 'screen' : 'camera'
}

/**
 * Плитка участника в UI: владелец камеры, либо peerId продюсера (если owner не задан).
 * Для vMix — всегда виртуальный peerId (одна плитка на vMix, не мешается с инициатором).
 */
export function videoAnchorPeerId(p: ProducerDescriptor): string {
  if (isVmixProducer(p)) return p.peerId
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
): 'camera' | 'screen' | 'studio_program' {
  const src = descriptorVideoSource(producer)
  if (src === 'vmix') return 'camera'
  if (src === 'studio_program') return 'studio_program'
  const owner = ownerPeerFromDescriptor(producer)
  const separateScreenPeer = Boolean(owner && producer.peerId !== owner)
  if (src === 'screen' || separateScreenPeer) return 'screen'
  if (src === 'camera') return 'camera'
  return resolveVideoProducerRole(producer, hasCameraStream)
}
