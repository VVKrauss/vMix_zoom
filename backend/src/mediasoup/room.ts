import type {
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
  RtpParameters,
  MediaKind,
} from 'mediasoup/node/lib/types'
import { Peer } from './peer'
import { config } from '../config'
import { getNextWorker } from './worker'
import { startFFmpegForPeer, stopFFmpegForPeer } from '../srt/ffmpegManager'

export class Room {
  readonly id: string
  router!: Router
  readonly peers = new Map<string, Peer>()

  private usedSrtPorts = new Set<number>()

  private constructor(id: string) {
    this.id = id
  }

  static async create(id: string): Promise<Room> {
    const room = new Room(id)
    const worker = getNextWorker()
    room.router = await worker.createRouter({
      mediaCodecs: config.mediasoup.routerOptions.mediaCodecs,
    })
    console.log(`[Room] Created room "${id}"`)
    return room
  }

  // ─── Port management ──────────────────────────────────────────────────────

  private allocateSrtPort(): number {
    for (let p = config.srtBasePort; p < config.srtBasePort + config.maxPeers; p++) {
      if (!this.usedSrtPorts.has(p)) {
        this.usedSrtPorts.add(p)
        return p
      }
    }
    throw new Error('No SRT ports available (room full)')
  }

  private freeSrtPort(port: number) {
    this.usedSrtPorts.delete(port)
  }

  // ─── Peer lifecycle ───────────────────────────────────────────────────────

  async addPeer(peerId: string, displayName: string): Promise<Peer> {
    const srtPort = this.allocateSrtPort()
    const peer = new Peer(peerId, displayName, srtPort)
    this.peers.set(peerId, peer)
    console.log(`[Room] Peer added: ${displayName} (${peerId}) → SRT :${srtPort}`)
    return peer
  }

  async removePeer(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId)
    if (!peer) return
    stopFFmpegForPeer(peerId)
    this.freeSrtPort(peer.srtPort)
    peer.close()
    this.peers.delete(peerId)
    console.log(`[Room] Peer removed: ${peer.displayName} (${peerId})`)
  }

  // ─── Transport ────────────────────────────────────────────────────────────

  async createWebRtcTransport(peerId: string, producing: boolean): Promise<WebRtcTransport> {
    const peer = this.getPeer(peerId)

    const transport = await this.router.createWebRtcTransport(
      config.mediasoup.webRtcTransportOptions
    )

    transport.on('dtlsstatechange', (state) => {
      if (state === 'closed') transport.close()
    })

    if (producing) {
      peer.sendTransport = transport
    } else {
      peer.recvTransport = transport
    }

    return transport
  }

  async connectTransport(
    peerId: string,
    transportId: string,
    dtlsParameters: object
  ): Promise<void> {
    const peer = this.getPeer(peerId)
    const transport = this.findTransport(peer, transportId)
    await transport.connect({ dtlsParameters })
  }

  // ─── Produce ──────────────────────────────────────────────────────────────

  async produce(
    peerId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData: Record<string, unknown>
  ): Promise<Producer> {
    const peer = this.getPeer(peerId)
    const transport = this.findTransport(peer, transportId)

    const producer = await transport.produce({ kind, rtpParameters, appData })
    peer.producers.set(producer.id, producer)

    producer.on('transportclose', () => peer.producers.delete(producer.id))

    // Start SRT pipeline once we have both tracks
    const hasVideo = [...peer.producers.values()].some((p) => p.kind === 'video')
    const hasAudio = [...peer.producers.values()].some((p) => p.kind === 'audio')
    if (hasVideo && hasAudio && !peer.srtActive) {
      peer.srtActive = true
      this.startSrtForPeer(peer).catch((err) => {
        peer.srtActive = false
        console.error(`[Room] SRT start failed for ${peer.displayName}:`, err)
      })
    }

    return producer
  }

  // ─── Consume ──────────────────────────────────────────────────────────────

  async consume(
    consumerPeerId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities
  ): Promise<Consumer> {
    const consumerPeer = this.getPeer(consumerPeerId)
    const recvTransport = consumerPeer.recvTransport
    if (!recvTransport) throw new Error('No recvTransport for peer')

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume')
    }

    const consumer = await recvTransport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    })

    consumerPeer.consumers.set(consumer.id, consumer)

    consumer.on('transportclose', () => consumerPeer.consumers.delete(consumer.id))
    consumer.on('producerclose', () => consumerPeer.consumers.delete(consumer.id))

    return consumer
  }

  async resumeConsumer(peerId: string, consumerId: string): Promise<void> {
    const peer = this.getPeer(peerId)
    const consumer = peer.consumers.get(consumerId)
    if (!consumer) throw new Error('Consumer not found')
    await consumer.resume()
  }

  // ─── SRT Pipeline ─────────────────────────────────────────────────────────

  private async startSrtForPeer(peer: Peer): Promise<void> {
    const videoProducer = [...peer.producers.values()].find((p) => p.kind === 'video')
    const audioProducer = [...peer.producers.values()].find((p) => p.kind === 'audio')
    if (!videoProducer || !audioProducer) return

    const peerIndex = peer.srtPort - config.srtBasePort
    const videoRtpPort = config.rtpBasePort + peerIndex * 4
    const audioRtpPort = videoRtpPort + 2

    // Create plain transports and connect to FFmpeg RTP ports
    const plainVideoTransport = await this.router.createPlainTransport({
      listenIp: { ip: '127.0.0.1' },
      rtcpMux: true,
      comedia: false,
    })
    const plainAudioTransport = await this.router.createPlainTransport({
      listenIp: { ip: '127.0.0.1' },
      rtcpMux: true,
      comedia: false,
    })

    peer.plainVideoTransport = plainVideoTransport
    peer.plainAudioTransport = plainAudioTransport

    // Create RTP consumers (paused until FFmpeg is ready)
    const rtpVideoConsumer = await plainVideoTransport.consume({
      producerId: videoProducer.id,
      rtpCapabilities: this.router.rtpCapabilities,
      paused: true,
    })
    const rtpAudioConsumer = await plainAudioTransport.consume({
      producerId: audioProducer.id,
      rtpCapabilities: this.router.rtpCapabilities,
      paused: true,
    })

    // Prefer highest spatial/temporal layer for SRT output
    if (rtpVideoConsumer.type === 'simulcast' || rtpVideoConsumer.type === 'svc') {
      await rtpVideoConsumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 })
    }

    peer.rtpVideoConsumer = rtpVideoConsumer
    peer.rtpAudioConsumer = rtpAudioConsumer

    // Point transports at FFmpeg
    await plainVideoTransport.connect({ ip: '127.0.0.1', port: videoRtpPort })
    await plainAudioTransport.connect({ ip: '127.0.0.1', port: audioRtpPort })

    // Launch FFmpeg, then resume after it's bound
    const ffmpegProcess = await startFFmpegForPeer(
      peer.id,
      videoRtpPort,
      audioRtpPort,
      rtpVideoConsumer.rtpParameters,
      rtpAudioConsumer.rtpParameters,
      peer.srtPort,
      peer.displayName
    )
    peer.ffmpegProcess = ffmpegProcess

    // Give FFmpeg ~2s to bind its RTP sockets
    await delay(2000)
    await rtpVideoConsumer.resume()
    await rtpAudioConsumer.resume()

    console.log(
      `[Room] SRT stream active: ${peer.displayName} → srt://server:${peer.srtPort}`
    )
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  getOtherPeersInfo(peerId: string) {
    return [...this.peers.values()]
      .filter((p) => p.id !== peerId)
      .map((p) => p.getInfo())
  }

  isEmpty() {
    return this.peers.size === 0
  }

  close() {
    this.peers.forEach((p) => {
      stopFFmpegForPeer(p.id)
      p.close()
    })
    this.router.close()
  }

  private getPeer(peerId: string): Peer {
    const peer = this.peers.get(peerId)
    if (!peer) throw new Error(`Peer not found: ${peerId}`)
    return peer
  }

  private findTransport(peer: Peer, transportId: string): WebRtcTransport {
    if (peer.sendTransport?.id === transportId) return peer.sendTransport
    if (peer.recvTransport?.id === transportId) return peer.recvTransport
    throw new Error(`Transport not found: ${transportId}`)
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
