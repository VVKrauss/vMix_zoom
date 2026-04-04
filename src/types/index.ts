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
