import type { VideoPreset } from '../types'
import { isIosLikeDevice } from './iosLikeDevice'

function videoPresetConstraints(preset: VideoPreset): MediaTrackConstraintSet {
  return {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.frameRate },
  }
}

/**
 * Включение камеры уже в комнате: тот же порядок, что был в useRoom до «длинной лестницы» —
 * сначала пресет, опционально preferred через ideal, на iOS — facingMode, затем video: true.
 * Без десятков последовательных getUserMedia (каждый может долго висеть до AbortError).
 */
export async function acquireRoomCameraVideoStream(
  preset: VideoPreset,
  preferredDeviceId: string | null | undefined,
): Promise<MediaStream> {
  const id = preferredDeviceId?.trim() || ''
  const vp = videoPresetConstraints(preset)

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: vp })
  } catch {
    /* fall through */
  }
  if (id) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...vp, deviceId: { ideal: id } },
      })
    } catch {
      /* fall through */
    }
  }
  if (isIosLikeDevice()) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'user' } },
      })
    } catch {
      /* fall through */
    }
  }
  return await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
}
