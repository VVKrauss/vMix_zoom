export interface RemotePeer {
  peerId: string
  displayName: string
  srtPort: number
  videoStream: MediaStream | null
  audioStream: MediaStream | null
  videoConsumerId?: string
  audioConsumerId?: string
}

export interface JoinResult {
  ok: boolean
  peerId?: string
  srtPort?: number
  routerRtpCapabilities?: object
  peers?: PeerInfo[]
  error?: string
}

export interface PeerInfo {
  peerId: string
  displayName: string
  srtPort: number
  producers: Array<{ id: string; kind: 'audio' | 'video' }>
}

export interface TransportResult {
  ok: boolean
  id?: string
  iceParameters?: object
  iceCandidates?: object[]
  dtlsParameters?: object
  error?: string
}

export interface ProduceResult {
  ok: boolean
  id?: string
  error?: string
}

export interface ConsumeResult {
  ok: boolean
  id?: string
  producerId?: string
  kind?: 'audio' | 'video'
  rtpParameters?: object
  error?: string
}
