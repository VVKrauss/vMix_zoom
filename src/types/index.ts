/** Пресет качества видео (разрешение + битрейт) */
export type VideoPreset = {
  label:        string
  width:        number
  height:       number
  frameRate:    number
  maxBitrate:   number   // bps
  startBitrate: number   // kbps (videoGoogleStartBitrate)
}

export const VIDEO_PRESETS: VideoPreset[] = [
  { label: '480p · 1.5 Mbps', width:  854, height:  480, frameRate: 30, maxBitrate: 1_500_000, startBitrate:  800 },
  { label: '720p · 4 Mbps',   width: 1280, height:  720, frameRate: 30, maxBitrate: 4_000_000, startBitrate: 1500 },
  { label: '1080p · 6 Mbps',  width: 1920, height: 1080, frameRate: 30, maxBitrate: 6_000_000, startBitrate: 2000 },
  { label: '1080p · 10 Mbps', width: 1920, height: 1080, frameRate: 30, maxBitrate: 10_000_000, startBitrate: 3000 },
]

export const DEFAULT_VIDEO_PRESET = VIDEO_PRESETS[1] // 720p · 4 Mbps

export type ProducerDescriptor = {
  producerId: string
  peerId: string
  kind: 'audio' | 'video'
  name: string
}

export type RemoteParticipant = {
  peerId: string
  name: string
  audioStream?: MediaStream
  videoStream?: MediaStream
}

/** Socket.IO `srtStarted` и элементы `srt[]` из GET /api/frontend/rooms/:roomId */
export type SrtSessionInfo = {
  peerId: string
  roomId: string
  sessionId: string
  listenPort: number
  connectUrlPublic: string
}

/** Ответ GET /api/frontend/rooms/:roomId (фрагмент) */
export type FrontendRoomSrtRow = {
  sessionId: string
  peerId: string
  listenPort: number
  connectUrlPublic: string
}

export type FrontendRoomDetail = {
  roomId: string
  srt?: FrontendRoomSrtRow[]
}
