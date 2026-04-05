import { useEffect, useRef, useState } from 'react'
import type { RemoteParticipant } from '../types'

const POLL_MS = 90
/** Порог RMS (линейный), выше — считаем, что участник говорит */
const SPEAK_RMS = 0.022
/** После тишины вернуться на «я или первый гость» */
const SILENCE_REVERT_MS = 1400
/** Режим «Спикер»: не чаще одного автопереключения на сцену за этот интервал (параллельная речь). */
const MIN_SWITCH_MS = 2500

let sharedCtx: AudioContext | null = null
function getCtx(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext()
  }
  return sharedCtx
}

type FloatBuf = Float32Array<ArrayBuffer>

function rmsLinear(analyser: AnalyserNode, buf: FloatBuf): number {
  analyser.getFloatTimeDomainData(buf)
  let s = 0
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]!
    s += v * v
  }
  return Math.sqrt(s / buf.length)
}

function defaultStagePeer(localPeerId: string, remotes: RemoteParticipant[]): string {
  return remotes[0]?.peerId ?? localPeerId
}

/**
 * Для режима «Спикер»: peerId участника с камерой, у кого сейчас сильнее всего звук в микрофоне.
 */
export function useActiveSpeaker(
  enabled: boolean,
  localPeerId: string,
  localStream: MediaStream | null,
  isMuted: boolean,
  remotes: RemoteParticipant[],
): string {
  const [active, setActive] = useState(() => defaultStagePeer(localPeerId, remotes))

  const activeRef = useRef(active)
  activeRef.current = active

  const lastSwitchRef = useRef(0)
  const silenceSinceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      setActive(defaultStagePeer(localPeerId, remotes))
      return
    }

    const fallback = () => defaultStagePeer(localPeerId, remotes)
    setActive((prev) => {
      const fb = fallback()
      const ids = new Set([localPeerId, ...remotes.map((p) => p.peerId)])
      return ids.has(prev) ? prev : fb
    })

    type NodeRow = { analyser: AnalyserNode; buf: FloatBuf; source: MediaStreamAudioSourceNode }
    const nodes = new Map<string, NodeRow>()
    const ctx = getCtx()

    const addStream = (peerId: string, stream: MediaStream) => {
      if (nodes.has(peerId)) return
      const tracks = stream.getAudioTracks().filter((t) => t.readyState === 'live')
      if (!tracks.length) return
      try {
        const ms = new MediaStream(tracks)
        const source = ctx.createMediaStreamSource(ms)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.65
        source.connect(analyser)
        const buf = new Float32Array(analyser.fftSize) as FloatBuf
        nodes.set(peerId, { analyser, buf, source })
      } catch {
        /* noop */
      }
    }

    if (localStream && !isMuted) addStream(localPeerId, localStream)
    for (const p of remotes) {
      if (p.audioStream) addStream(p.peerId, p.audioStream)
    }

    if (nodes.size === 0) {
      const fb = fallback()
      setActive(fb)
      activeRef.current = fb
      return
    }

    let timer: ReturnType<typeof window.setInterval>

    const tick = () => {
      const now = performance.now()
      const cur = activeRef.current
      let bestId = ''
      let bestR = 0
      for (const [id, { analyser, buf }] of nodes) {
        const r = rmsLinear(analyser, buf)
        if (r > bestR) {
          bestR = r
          bestId = id
        }
      }

      const fb = fallback()

      if (bestR >= SPEAK_RMS && bestId) {
        silenceSinceRef.current = null
        if (bestId !== cur && now - lastSwitchRef.current >= MIN_SWITCH_MS) {
          activeRef.current = bestId
          setActive(bestId)
          lastSwitchRef.current = now
        }
      } else {
        if (silenceSinceRef.current == null) silenceSinceRef.current = now
        if (now - (silenceSinceRef.current ?? now) >= SILENCE_REVERT_MS && cur !== fb) {
          activeRef.current = fb
          setActive(fb)
          lastSwitchRef.current = now
        }
      }
    }

    timer = window.setInterval(tick, POLL_MS)
    void ctx.resume().catch(() => {})

    return () => {
      window.clearInterval(timer)
      for (const { source } of nodes.values()) {
        try {
          source.disconnect()
        } catch {
          /* noop */
        }
      }
      nodes.clear()
    }
  }, [enabled, localPeerId, localStream, isMuted, remotes])

  return active
}
