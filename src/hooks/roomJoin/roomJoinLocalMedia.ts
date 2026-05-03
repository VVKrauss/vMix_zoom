import { readPreferredCameraId, readPreferredMicId } from '../../config/roomUiStorage'
import { isIosLikeDevice } from '../../utils/iosLikeDevice'
import { buildRoomMicTrackConstraints } from '../../utils/roomMicCapture'
import { getUserMediaAudioThenVideo } from '../../utils/splitAvMediaStream'
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
 * Шаг join: при одновременном микрофоне и камере сначала раздельный захват (splitAvMediaStream),
 * затем до трёх combined/fallback — без длинных цепочек на каждом уровне микрофона.
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
    const videoLoose = wantCam
      ? {
          width: { ideal: preset.width },
          height: { ideal: preset.height },
          frameRate: { ideal: preset.frameRate },
        }
      : false

    if (wantMic && wantCam) {
      try {
        stream = await getUserMediaAudioThenVideo(audioPart, videoPart)
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioPart,
            video: videoPart,
          })
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: wantMic ? buildRoomMicTrackConstraints(!isIosLikeDevice() && micPref ? micPref : null) : false,
              video: videoLoose || false,
            })
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: wantMic,
              video: videoLoose || false,
            })
          }
        }
      }
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioPart,
          video: videoPart,
        })
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: wantMic ? buildRoomMicTrackConstraints(!isIosLikeDevice() && micPref ? micPref : null) : false,
            video: videoLoose || false,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: wantMic,
            video: videoLoose || false,
          })
        }
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
