import { isIosLikeDevice } from './iosLikeDevice'
import { readRoomMicRawCapture } from '../config/roomUiStorage'

/**
 * Ограничения для микрофона в комнате (Mediasoup).
 *
 * **По умолчанию** не задаём echoCancellation / noiseSuppression / autoGainControl — браузер
 * включает типичную голосовую обработку; так стабильнее на телефонах и Windows («мёртвый» мик,
 * отказ драйвера при жёстком выключении DSP).
 *
 * Режим «сырой» захват (`localStorage` `vmix_room_mic_raw_capture=1`, см. `readRoomMicRawCapture`):
 * всё выключено — для редкого случая, когда встроенный AEC портит сведение с громкими колонками/SRT.
 *
 * Устройство: **`ideal`**, не `exact`, чтобы не ломаться при смене дефолтного микрофона в ОС;
 * на iOS `deviceId` не передаём (стабильнее Bluetooth / маршрут).
 */
export function buildRoomMicTrackConstraints(deviceIdPreferred: string | null | undefined): MediaTrackConstraints {
  const c: MediaTrackConstraints = {}
  if (readRoomMicRawCapture()) {
    c.echoCancellation = false
    c.noiseSuppression = false
    c.autoGainControl = false
  }
  const id = deviceIdPreferred?.trim()
  if (id && !isIosLikeDevice()) {
    c.deviceId = { ideal: id }
  }
  return c
}
