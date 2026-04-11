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
  { label: '720p · 4 Mbps',   width: 1280, height:  720, frameRate: 30, maxBitrate: 4_000_000, startBitrate: 1200 },
  { label: '1080p · 6 Mbps',  width: 1920, height: 1080, frameRate: 30, maxBitrate: 6_000_000, startBitrate: 2000 },
  { label: '1080p · 10 Mbps', width: 1920, height: 1080, frameRate: 30, maxBitrate: 10_000_000, startBitrate: 3000 },
]

/** Умеренный дефолт для SRT/vMix; максимальные пресеты — в настройках комнаты. */
export const DEFAULT_VIDEO_PRESET = VIDEO_PRESETS[1]

export type ProducerDescriptor = {
  producerId: string
  /** Для демонстрации — отдельный id; камера/аудио участника — основной peerId. */
  peerId: string
  kind: 'audio' | 'video'
  name: string
  /** С сервера / ростера; для плитки без видео */
  avatarUrl?: string | null
  authUserId?: string | null
  /** Явный источник видео (из producer.appData на бэке). */
  videoSource?: 'camera' | 'screen' | 'vmix' | 'studio_program'
  /** Если peerId у видео экрана — отдельный, здесь peerId «хозяина» (камера/имя в комнате). */
  ownerPeerId?: string
  /** Сырой appData с бэка; часто `{ source: 'screen', ownerPeerId }`. */
  appData?: Record<string, unknown>
}

/** Ack `startVmixIngress` при `res.ok`. */
export type VmixIngressInfo = {
  publicHost: string
  listenPort: number
  latencyMs: number
  /** Фактический лимит libx264 (кбит/с) после клампа; `null` — лимита нет. */
  videoBitrateKbps?: number | null
  passphrase?: string
  streamId?: string
  pbkeylen?: number
}

export type RemoteParticipant = {
  peerId: string
  name: string
  avatarUrl?: string | null
  authUserId?: string | null
  virtualSourceType?: 'studio_program'
  sourceOwnerPeerId?: string
  audioStream?: MediaStream
  videoStream?: MediaStream
  /** Второй video producer (демонстрация экрана). */
  screenStream?: MediaStream
  /** Отдельный peerId продюсера экрана (соло-ссылка и SRT), если отдаёт бэкенд. */
  screenPeerId?: string
  /** RTMP-выход режима «Студия» (отдельно от демонстрации экрана). */
  studioProgramStream?: MediaStream
  studioProgramPeerId?: string
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
