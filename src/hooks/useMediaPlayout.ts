import { type RefObject, useEffect } from 'react'

/** Громкость и выход звука (setSinkId) для удалённого медиа. */
export function useBindPlayout(
  ref: RefObject<HTMLMediaElement | null>,
  volume: number,
  sinkId: string,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return
    el.volume = Math.min(1, Math.max(0, volume))
    if (!sinkId || !('setSinkId' in el)) return
    const media = el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }
    void media.setSinkId(sinkId).catch(() => {})
  // ref — стабильный объект; перезапуск по volume/sinkId/active
  }, [volume, sinkId, active])
}
