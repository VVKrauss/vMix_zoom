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
