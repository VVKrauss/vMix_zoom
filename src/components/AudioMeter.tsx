import { useEffect, useRef } from 'react'

interface Props {
  stream: MediaStream | null
  stereo?: boolean
}

const MIN_DB = -60
const MAX_DB = 3
const SEGMENTS = 28
const SEG_GAP = 1
const CHAN_GAP = 3
const CHAN_W = 7

let sharedAudioCtx: AudioContext | null = null
function getAudioContext(): AudioContext {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioContext()
  }
  return sharedAudioCtx
}

function segmentColour(db: number, active: boolean): string {
  if (!active) return 'rgba(255,255,255,0.07)'
  if (db >= -2)  return '#f44336'
  if (db >= -6)  return '#ffb300'
  return '#43a047'
}

function getRms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf)
  const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)
  return rms === 0 ? MIN_DB : Math.max(MIN_DB, 20 * Math.log10(rms))
}

export function AudioMeter({ stream, stereo = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  const channels = stereo ? 2 : 1
  const canvasW  = channels * CHAN_W + (channels - 1) * CHAN_GAP

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !stream) return

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length === 0) return

    const audioCtx = getAudioContext()
    const source   = audioCtx.createMediaStreamSource(stream)
    const analysers: AnalyserNode[] = []

    if (stereo) {
      const splitter = audioCtx.createChannelSplitter(2)
      source.connect(splitter)
      for (let i = 0; i < 2; i++) {
        const a = audioCtx.createAnalyser()
        a.fftSize = 512
        a.smoothingTimeConstant = 0.6
        splitter.connect(a, i)
        analysers.push(a)
      }
    } else {
      const a = audioCtx.createAnalyser()
      a.fftSize = 512
      a.smoothingTimeConstant = 0.6
      source.connect(a)
      analysers.push(a)
    }

    const buf = new Float32Array(analysers[0].fftSize)
    const ctx2d = canvas.getContext('2d')!

    const draw = () => {
      const wrap = canvas.parentElement as HTMLElement
      const h = wrap ? wrap.clientHeight : 200
      const w = wrap ? wrap.clientWidth  : canvasW
      if (canvas.height !== h) canvas.height = h
      if (canvas.width  !== w) canvas.width  = w

      ctx2d.clearRect(0, 0, w, h)

      const segH = Math.max(2, (h - SEGMENTS * SEG_GAP) / SEGMENTS)

      analysers.forEach((analyser, ch) => {
        const db      = getRms(analyser, buf)
        const active  = Math.round(((db - MIN_DB) / (MAX_DB - MIN_DB)) * SEGMENTS)
        const xOffset = ch * (CHAN_W + CHAN_GAP)

        for (let s = 0; s < SEGMENTS; s++) {
          const segDb = MIN_DB + (s / SEGMENTS) * (MAX_DB - MIN_DB)
          const y     = h - (s + 1) * (segH + SEG_GAP) + SEG_GAP
          ctx2d.fillStyle = segmentColour(segDb, s < active)
          ctx2d.fillRect(xOffset, y, CHAN_W, segH)
        }
      })

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(rafRef.current)
      source.disconnect()
      analysers.forEach(a => a.disconnect())
    }
  }, [stream, stereo, canvasW])

  return (
    <div className="audio-meter-wrap" style={{ width: canvasW + 6 }}>
      <canvas ref={canvasRef} className="audio-meter-canvas" width={canvasW} height={4} />
    </div>
  )
}
