import { useEffect, useState } from 'react'
import type { InboundVideoQuality } from '../utils/inboundVideoStats'

const LEVEL_COLOR: Record<InboundVideoQuality['level'], string> = {
  1: '#e53935',
  2: '#ff9800',
  3: '#ffeb3b',
  4: '#cddc39',
  5: '#43a047',
}

const BAR_HEIGHTS_PX = [5, 8, 11, 14, 17]

interface Props {
  /** null — ещё нет выборки; показываем все полоски «пустыми». */
  quality: InboundVideoQuality | null
}

export function RemoteVideoSignalBars({ quality }: Props) {
  const level = quality?.level ?? null
  const activeColor = level != null ? LEVEL_COLOR[level] : undefined

  return (
    <div
      className="remote-signal-bars"
      role="img"
      aria-label={
        level != null
          ? `Качество видео до сервера: ${level} из 5`
          : 'Качество видео до сервера: измерение…'
      }
    >
      {BAR_HEIGHTS_PX.map((h, i) => {
        const idx = i + 1
        const active = level != null && idx <= level
        return (
          <span
            key={idx}
            className={`remote-signal-bars__bar${active ? ' remote-signal-bars__bar--active' : ''}`}
            style={{
              height: h,
              backgroundColor: active ? activeColor : 'rgba(45, 45, 45, 0.55)',
            }}
          />
        )
      })}
    </div>
  )
}

/** Опрос getStats с интервалом; не монтируется без enabled. */
export function useInboundVideoQualityPoll(
  enabled: boolean,
  fetchQuality: () => Promise<InboundVideoQuality | null>,
): InboundVideoQuality | null {
  const [q, setQ] = useState<InboundVideoQuality | null>(null)

  useEffect(() => {
    if (!enabled) {
      setQ(null)
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const next = await fetchQuality()
        if (!cancelled) setQ(next)
      } catch {
        if (!cancelled) setQ(null)
      }
    }
    void tick()
    const id = window.setInterval(() => { void tick() }, 1500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled, fetchQuality])

  return q
}
