import type { RtpCodecCapability } from 'mediasoup/node/lib/types'

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
]

export const config = {
  listenPort: parseInt(process.env.PORT ?? '3000', 10),
  announcedIp: process.env.ANNOUNCED_IP ?? '127.0.0.1',
  srtBasePort: parseInt(process.env.SRT_BASE_PORT ?? '9001', 10),
  maxPeers: parseInt(process.env.MAX_PEERS ?? '10', 10),

  mediasoup: {
    numWorkers: Math.min(
      parseInt(process.env.MEDIASOUP_WORKER_COUNT ?? '2', 10),
      require('os').cpus().length
    ),
    workerSettings: {
      logLevel: 'warn' as const,
      rtcMinPort: parseInt(process.env.RTC_MIN_PORT ?? '40000', 10),
      rtcMaxPort: parseInt(process.env.RTC_MAX_PORT ?? '49999', 10),
    },
    routerOptions: { mediaCodecs },
    webRtcTransportOptions: {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: process.env.ANNOUNCED_IP ?? '127.0.0.1',
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 5_000_000,
      minimumAvailableOutgoingBitrate: 600_000,
      maxSctpMessageSize: 262144,
    },
  },

  // RTP base port for FFmpeg plain transports (localhost only)
  // Layout: peerIndex * 4 + rtpBase → video, +2 → audio
  rtpBasePort: parseInt(process.env.RTP_BASE_PORT ?? '20000', 10),
}
