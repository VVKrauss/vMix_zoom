import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_MAX_SEC = 120

export type VoiceRecorderStopResult = { blob: Blob; durationSec: number } | null

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

export function useMessengerVoiceRecorder(options?: {
  maxSec?: number
  /** Вызывается после успешного `stop()` (в т.ч. при авто-стопе по лимиту длительности). Не вызывается при `cancel()`. */
  onAfterStop?: (result: VoiceRecorderStopResult) => void
}) {
  const maxSec = options?.maxSec ?? DEFAULT_MAX_SEC
  const onAfterStopRef = useRef(options?.onAfterStop)
  onAfterStopRef.current = options?.onAfterStop

  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startMsRef = useRef(0)
  const maxHitRef = useRef(false)
  /** Пока идёт getUserMedia / старт MediaRecorder — для отмены до isRecording */
  const startingRef = useRef(false)

  const cleanupStream = useCallback(() => {
    mediaRef.current?.getTracks().forEach((t) => t.stop())
    mediaRef.current = null
  }, [])

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearTick()
      startingRef.current = false
      const r = recRef.current
      if (r && r.state !== 'inactive') {
        try {
          r.stop()
        } catch {
          /* ignore */
        }
      }
      recRef.current = null
      cleanupStream()
    }
  }, [cleanupStream, clearTick])

  const stopInternal = useCallback((): Promise<VoiceRecorderStopResult> => {
    clearTick()
    const rec = recRef.current
    recRef.current = null
    if (!rec || rec.state === 'inactive') {
      cleanupStream()
      setIsRecording(false)
      setSeconds(0)
      startingRef.current = false
      return Promise.resolve(null)
    }
    return new Promise((resolve) => {
      rec.onstop = () => {
        const rawMs = Date.now() - startMsRef.current
        const durationSec = Math.min(maxSec, Math.max(0.4, rawMs / 1000))
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        chunksRef.current = []
        cleanupStream()
        setIsRecording(false)
        setSeconds(0)
        maxHitRef.current = false
        startingRef.current = false
        if (blob.size < 400) {
          resolve(null)
          return
        }
        resolve({ blob, durationSec })
      }
      try {
        rec.stop()
      } catch {
        chunksRef.current = []
        cleanupStream()
        setIsRecording(false)
        setSeconds(0)
        startingRef.current = false
        resolve(null)
      }
    })
  }, [cleanupStream, clearTick, maxSec])

  const stop = useCallback(async (): Promise<VoiceRecorderStopResult> => {
    const r = await stopInternal()
    if (r) onAfterStopRef.current?.(r)
    return r
  }, [stopInternal])

  const stopRef = useRef(stop)
  stopRef.current = stop

  const start = useCallback(async (): Promise<boolean> => {
    setError(null)
    maxHitRef.current = false
    startingRef.current = true
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      startingRef.current = false
      setError('Микрофон недоступен')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!startingRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return false
      }
      mediaRef.current = stream
      const mime = pickMimeType()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.start(200)
      recRef.current = rec
      startMsRef.current = Date.now()
      setSeconds(0)
      setIsRecording(true)
      startingRef.current = false
      clearTick()
      tickRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startMsRef.current) / 1000)
        setSeconds(s)
        if (s >= maxSec && !maxHitRef.current) {
          maxHitRef.current = true
          void stopRef.current()
        }
      }, 300)
      return true
    } catch (e) {
      startingRef.current = false
      cleanupStream()
      setError(e instanceof Error ? e.message : 'mic_denied')
      return false
    }
  }, [cleanupStream, clearTick, maxSec])

  const cancel = useCallback(() => {
    startingRef.current = false
    clearTick()
    maxHitRef.current = false
    const rec = recRef.current
    recRef.current = null
    chunksRef.current = []
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        cleanupStream()
        setIsRecording(false)
        setSeconds(0)
      }
      try {
        rec.stop()
      } catch {
        cleanupStream()
        setIsRecording(false)
        setSeconds(0)
      }
    } else {
      cleanupStream()
      setIsRecording(false)
      setSeconds(0)
    }
  }, [cleanupStream, clearTick])

  return { isRecording, seconds, error, start, stop, cancel, maxSec }
}
