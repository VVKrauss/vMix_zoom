import { readPreferredCameraId, readPreferredMicId } from '../../config/roomUiStorage'
import { isIosLikeDevice } from '../../utils/iosLikeDevice'
import { buildRoomMicTrackConstraints } from '../../utils/roomMicCapture'
import type { VideoPreset } from '../../types'

export type JoinLocalMediaParams = {
  wantMic: boolean
  wantCam: boolean
  preset: VideoPreset
  aborted: () => boolean
  stopStreamTracks: (stream: MediaStream | null) => void
  setIsMuted: (v: boolean) => void
  setIsCamOff: (v: boolean) => void
  setStatus: (s: 'idle' | 'connecting' | 'connected' | 'error') => void
}

/**
 * Шаг join: getUserMedia по тумблерам входа (или пустой поток без треков).
 */
export async function captureJoinLocalMediaStream(p: JoinLocalMediaParams): Promise<MediaStream | null> {
  const { wantMic, wantCam, preset, aborted, stopStreamTracks, setIsMuted, setIsCamOff, setStatus } = p
  let stream: MediaStream
  if (!wantMic && !wantCam) {
    setIsMuted(true)
    setIsCamOff(true)
    stream = new MediaStream()
  } else {
    setIsMuted(!wantMic)
    setIsCamOff(!wantCam)
    const camPref = readPreferredCameraId()
    const micPref = readPreferredMicId()
    const videoPart = wantCam
      ? {
          ...(camPref ? { deviceId: { exact: camPref } as const } : {}),
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate },
        }
      : false
    const audioPart: boolean | MediaTrackConstraints = wantMic
      ? buildRoomMicTrackConstraints(!isIosLikeDevice() && micPref ? micPref : null)
      : false
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioPart,
        video: videoPart,
      })
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: wantMic ? buildRoomMicTrackConstraints(!isIosLikeDevice() && micPref ? micPref : null) : false,
          video: wantCam
            ? {
                width: { ideal: preset.width },
                height: { ideal: preset.height },
                frameRate: { ideal: preset.frameRate },
              }
            : false,
        })
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: wantMic,
          video: wantCam
            ? {
                width: { ideal: preset.width },
                height: { ideal: preset.height },
                frameRate: { ideal: preset.frameRate },
              }
            : false,
        })
      }
    }
  }
  if (aborted()) {
    stopStreamTracks(stream)
    setStatus('idle')
    return null
  }
  return stream
}
