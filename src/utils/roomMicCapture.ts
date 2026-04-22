import { isIosLikeDevice } from './iosLikeDevice'

/**
 * Ограничения для микрофона в комнате (Mediasoup).
 * Дефолтный echoCancellation в браузере при включённом микрофоне на части систем (особенно Windows)
 * ухудшает воспроизведение «программы» (SRT) — «аквариум», срез ВЧ, артефакты.
 * Отключаем встроенную обработку на захвате; при громких колонках возможно эхо — предпочтительны наушники.
 */
export function buildRoomMicTrackConstraints(deviceIdExact: string | null | undefined): MediaTrackConstraints {
  const c: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  }
  const id = deviceIdExact?.trim()
  if (!isIosLikeDevice() && id) c.deviceId = { exact: id }
  return c
}
