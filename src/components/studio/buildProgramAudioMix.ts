import type { StudioBoardState, StudioSourceOption } from '../../types/studio'

export type StudioSourceMixMap = Record<string, { volume: number }>

function streamWithAudio(opt: StudioSourceOption): MediaStream | null {
  const m = opt.meterStream
  if (m?.getAudioTracks().length) return m
  if (opt.stream.getAudioTracks().length) return opt.stream
  return null
}

export type StudioProgramMixHandle = {
  stream: MediaStream
  disconnect: () => void
  applyLevels: (mixMap: StudioSourceMixMap) => void
}

/**
 * Смешивает аудио источников на доске «Эфир» (уникальные треки).
 * Громкость обновляется через `applyLevels` без пересборки графа.
 */
export function connectStudioProgramAudioMix(
  board: StudioBoardState,
  sources: StudioSourceOption[],
  audioContext: AudioContext,
  initialMix: StudioSourceMixMap,
): StudioProgramMixHandle {
  const destination = audioContext.createMediaStreamDestination()
  const nodes: AudioNode[] = []
  const usedTrackIds = new Set<string>()
  const gainBySourceKey = new Map<string, GainNode>()

  for (const slot of board.slots) {
    if (!slot.sourceKey) continue
    const opt = sources.find((x) => x.key === slot.sourceKey)
    if (!opt) continue
    const ms = streamWithAudio(opt)
    if (!ms) continue
    const at = ms.getAudioTracks()[0]
    if (!at || at.readyState === 'ended' || usedTrackIds.has(at.id)) continue
    usedTrackIds.add(at.id)
    const src = audioContext.createMediaStreamSource(new MediaStream([at]))
    const gain = audioContext.createGain()
    src.connect(gain)
    gain.connect(destination)
    nodes.push(src, gain)
    gainBySourceKey.set(slot.sourceKey, gain)
  }

  const n = gainBySourceKey.size
  const base = n <= 1 ? 1 : 1 / Math.sqrt(n)

  const applyLevels = (mixMap: StudioSourceMixMap) => {
    for (const [key, gainNode] of gainBySourceKey) {
      const m = mixMap[key] ?? { volume: 1 }
      const u = Math.max(0, Math.min(1, m.volume))
      gainNode.gain.value = base * u
    }
  }

  applyLevels(initialMix)

  return {
    stream: destination.stream,
    disconnect: () => {
      for (const node of nodes) {
        try {
          node.disconnect()
        } catch {
          /* ignore */
        }
      }
      gainBySourceKey.clear()
    },
    applyLevels,
  }
}
