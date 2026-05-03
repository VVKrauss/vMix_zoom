import type { ProducerDescriptor } from '../types'
import { isProgramIngestPeerDisplayName } from './programIngest'

/** Для видео экрана с отдельным peerId — id участника-камеры (хозяин плитки в UI). */
export function ownerPeerFromDescriptor(p: ProducerDescriptor): string | undefined {
  if (typeof p.ownerPeerId === 'string' && p.ownerPeerId.trim()) return p.ownerPeerId.trim()
  const v = p.appData?.ownerPeerId
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function descriptorVideoSource(
  p: ProducerDescriptor,
): 'camera' | 'screen' | 'vmix' | undefined {
  const raw = p.appData?.source
  if (
    raw === 'studio_preview' ||
    raw === 'studio_program' ||
    p.appData?.studioPreview === true
  ) {
    return undefined
  }
  if (p.videoSource) return p.videoSource
  const src = p.appData?.source
  if (src === 'screen' || src === 'camera' || src === 'vmix') return src
  return undefined
}

export function descriptorAudioSource(p: ProducerDescriptor): 'mic' | 'screen' | 'vmix' | undefined {
  if (p.kind !== 'audio') return undefined
  if (p.audioSource === 'mic' || p.audioSource === 'screen' || p.audioSource === 'vmix') return p.audioSource
  const src = p.appData?.source
  if (src === 'screen_audio') return 'screen'
  if (src === 'mic') return 'mic'
  if (src === 'vmix') return 'vmix'
  // совместимость: некоторые бэки помечают аудио экрана как source='screen' при kind='audio'
  if (src === 'screen') return 'screen'
  return undefined
}

export function isVmixProducer(p: ProducerDescriptor): boolean {
  // Keep function name for compatibility; semantics = "program ingest" (SRT), not vendor-specific.
  return descriptorVideoSource(p) === 'vmix' || isProgramIngestPeerDisplayName(p.name)
}

/**
 * Плитка участника в UI: владелец камеры, либо peerId продюсера (если owner не задан).
 * Для программного входа (SRT) — всегда виртуальный peerId (одна плитка, не мешается с инициатором).
 */
export function videoAnchorPeerId(p: ProducerDescriptor): string {
  if (isVmixProducer(p)) return p.peerId
  const owner = ownerPeerFromDescriptor(p)
  return owner ?? p.peerId
}

/**
 * Аудио всегда крепится к `peerId` продюсера (mic / screen-audio / vmix — отдельные продюсеры).
 * При появлении иной модели (например screen-audio на owner peer) — менять здесь.
 */
export function audioAnchorPeerId(p: ProducerDescriptor): string {
  return p.peerId
}

/** Экран как отдельный peer относительно owner (эвристика consume без полного appData). */
export function hasSeparateScreenVideoPeer(producer: ProducerDescriptor): boolean {
  const owner = ownerPeerFromDescriptor(producer)
  return Boolean(owner && producer.peerId !== owner)
}

/**
 * Роль видео при **produce** (локальный аплинк): только camera vs screen (+ vmix→camera).
 * @see resolveConsumeVideoRole — роль при **consume** (входящие), там же эвристика separate screen peer.
 */
export function resolveVideoProducerRole(
  producer: ProducerDescriptor,
  hasCameraStream: boolean,
): 'camera' | 'screen' {
  const t = descriptorVideoSource(producer)
  if (t === 'vmix') return 'camera'
  if (t === 'screen') return 'screen'
  if (t === 'camera') return 'camera'
  return hasCameraStream ? 'screen' : 'camera'
}

/**
 * Роль видео при **consume** (входящие): отдельный screen peer, fallback на produce-роль.
 * @see resolveVideoProducerRole — локальный produce; при смене правил синхронизировать обе.
 */
export function resolveConsumeVideoRole(
  producer: ProducerDescriptor,
  hasCameraStream: boolean,
): 'camera' | 'screen' {
  const src = descriptorVideoSource(producer)
  if (src === 'vmix') return 'camera'
  const separateScreenPeer = hasSeparateScreenVideoPeer(producer)
  if (src === 'screen' || separateScreenPeer) return 'screen'
  if (src === 'camera') return 'camera'
  return resolveVideoProducerRole(producer, hasCameraStream)
}
