import type { ProducerDescriptor } from '../types'

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
