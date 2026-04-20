import { useEffect, useMemo, useRef, useState } from 'react'
import { announceMessengerAudioExclusive, subscribeMessengerAudioExclusive } from '../../lib/messengerAudioExclusive'
import { FiRrIcon } from '../icons'

function formatAudioDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec % 60)
  const m = Math.floor(sec / 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function MessengerAudioPlayer(props: {
  src: string
  durationSecMeta: number | undefined
  onReady?: () => void
}) {
  const { src, durationSecMeta, onReady } = props
  const instanceId = useMemo(
    () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `a-${Date.now()}-${Math.random()}`),
    [],
  )
  const audioRef = useRef<HTMLAudioElement>(null)
  const rafRef = useRef<number | null>(null)

  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(() =>
    typeof durationSecMeta === 'number' && Number.isFinite(durationSecMeta) && durationSecMeta >= 0 ? durationSecMeta : 0,
  )
  const [seeking, setSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)

  const totalSec = useMemo(() => {
    if (dur > 0) return dur
    if (typeof durationSecMeta === 'number' && Number.isFinite(durationSecMeta) && durationSecMeta >= 0) return durationSecMeta
    return 0
  }, [dur, durationSecMeta])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const syncDur = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDur(el.duration)
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => {
      setPlaying(false)
      setCur(0)
    }

    const syncPlaying = () => setPlaying(!el.paused)

    el.addEventListener('durationchange', syncDur)
    el.addEventListener('loadedmetadata', syncDur)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    el.addEventListener('canplay', syncPlaying)
    el.addEventListener('emptied', syncPlaying)
    el.addEventListener('error', syncPlaying)
    syncPlaying()

    return () => {
      el.removeEventListener('durationchange', syncDur)
      el.removeEventListener('loadedmetadata', syncDur)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('canplay', syncPlaying)
      el.removeEventListener('emptied', syncPlaying)
      el.removeEventListener('error', syncPlaying)
    }
  }, [src])

  useEffect(() => {
    return subscribeMessengerAudioExclusive(instanceId, () => {
      const el = audioRef.current
      if (!el) return
      el.pause()
      setPlaying(false)
    })
  }, [instanceId])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const tick = () => {
      if (!seeking) setCur(el.currentTime || 0)
      rafRef.current = window.requestAnimationFrame(tick)
    }

    rafRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [seeking])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (!el.paused) {
      // делаем отзывчиво: сразу отражаем действие пользователя
      setPlaying(false)
      el.pause()
      return
    }
    announceMessengerAudioExclusive(instanceId)
    setPlaying(true)
    void el.play().catch(() => {
      // если браузер запретил autoplay/воспроизведение — откатим UI
      setPlaying(false)
    })
  }

  const commitSeek = (v: number) => {
    const el = audioRef.current
    if (!el) return
    const t = Math.max(0, Math.min(totalSec || el.duration || 0, v))
    el.currentTime = t
    setCur(t)
  }

  const rangeMax = totalSec > 0 ? totalSec : Math.max(0, cur)
  const displayCur = seeking ? seekValue : cur

  return (
    <div className="messenger-audio-player">
      <audio
        ref={audioRef}
        className="messenger-audio-player__native"
        preload="metadata"
        src={src}
        onLoadedMetadata={() => onReady?.()}
      />
      <button
        type="button"
        className="messenger-audio-player__btn"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
      >
        <FiRrIcon name={playing ? 'pause' : 'play'} />
      </button>

      <div className="messenger-audio-player__bar">
        <input
          className="messenger-audio-player__range"
          type="range"
          min={0}
          max={rangeMax}
          step={0.1}
          value={Math.min(displayCur, rangeMax)}
          aria-label="Перемотка"
          onPointerDown={() => {
            setSeeking(true)
            setSeekValue(cur)
          }}
          onPointerUp={() => {
            setSeeking(false)
            commitSeek(seekValue)
          }}
          onPointerCancel={() => {
            setSeeking(false)
            commitSeek(seekValue)
          }}
          onChange={(e) => {
            const v = Number(e.currentTarget.value) || 0
            setSeekValue(v)
            if (!seeking) commitSeek(v)
          }}
        />
      </div>

      <div className="messenger-audio-player__meta" aria-live="polite">
        <span className="messenger-audio-player__time">{formatAudioDurationSec(displayCur)}</span>
        <span className="messenger-audio-player__duration">{formatAudioDurationSec(totalSec)}</span>
      </div>
    </div>
  )
}

