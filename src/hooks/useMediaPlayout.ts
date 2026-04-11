import { type RefObject, useEffect } from 'react'
import { isIosLikeDevice } from '../utils/iosLikeDevice'

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
    /* iOS: маршрут вывода задаёт система (AirPods/BT); setSinkId часто не поддержан или ломает маршрут */
    if (isIosLikeDevice()) return
    if (!sinkId || !('setSinkId' in el)) return
    const media = el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> }
    void media.setSinkId(sinkId).catch(() => {})
  // ref — стабильный объект; перезапуск по volume/sinkId/active
  }, [volume, sinkId, active])
}
