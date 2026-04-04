import type { WebRtcTransport, Producer, Consumer, PlainTransport } from 'mediasoup/node/lib/types'
import type { ChildProcess } from 'child_process'

export class Peer {
  readonly id: string
  readonly displayName: string
  readonly srtPort: number

  sendTransport?: WebRtcTransport
  recvTransport?: WebRtcTransport

  producers = new Map<string, Producer>()
  consumers = new Map<string, Consumer>()

  // SRT / FFmpeg pipeline
  plainVideoTransport?: PlainTransport
  plainAudioTransport?: PlainTransport
  rtpVideoConsumer?: Consumer
  rtpAudioConsumer?: Consumer
  ffmpegProcess?: ChildProcess
  srtActive = false

  constructor(id: string, displayName: string, srtPort: number) {
    this.id = id
    this.displayName = displayName
    this.srtPort = srtPort
  }

  getInfo() {
    return {
      peerId: this.id,
      displayName: this.displayName,
      srtPort: this.srtPort,
      producers: Array.from(this.producers.values()).map((p) => ({
        id: p.id,
        kind: p.kind,
      })),
    }
  }

  close() {
    this.sendTransport?.close()
    this.recvTransport?.close()
    this.plainVideoTransport?.close()
    this.plainAudioTransport?.close()
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGINT')
      this.ffmpegProcess = undefined
    }
  }
}
