import { spawn, ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { RtpParameters } from 'mediasoup/node/lib/types'

const ffmpegProcesses = new Map<string, ChildProcess>()

// ─── SDP generator ────────────────────────────────────────────────────────────

function buildSdp(
  videoRtpParameters: RtpParameters,
  audioRtpParameters: RtpParameters,
  videoPort: number,
  audioPort: number
): string {
  const vc = videoRtpParameters.codecs[0]!
  const ac = audioRtpParameters.codecs[0]!

  const videoMime = vc.mimeType.split('/')[1]!.toUpperCase()
  const audioMime = ac.mimeType.split('/')[1]!.toLowerCase()
  const audioChannels = ac.channels ?? 1
  const audioRtpmapValue =
    audioChannels > 1
      ? `${ac.payloadType} ${audioMime}/${ac.clockRate}/${audioChannels}`
      : `${ac.payloadType} ${audioMime}/${ac.clockRate}`

  const videoFmtp =
    vc.parameters && Object.keys(vc.parameters).length > 0
      ? `a=fmtp:${vc.payloadType} ${Object.entries(vc.parameters)
          .map(([k, v]) => `${k}=${v}`)
          .join(';')}`
      : ''

  const audioFmtp =
    ac.parameters && Object.keys(ac.parameters).length > 0
      ? `a=fmtp:${ac.payloadType} ${Object.entries(ac.parameters)
          .map(([k, v]) => `${k}=${v}`)
          .join(';')}`
      : ''

  return [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=vmix-streamer',
    'c=IN IP4 127.0.0.1',
    't=0 0',
    `m=video ${videoPort} RTP/AVP ${vc.payloadType}`,
    `a=rtpmap:${vc.payloadType} ${videoMime}/${vc.clockRate}`,
    videoFmtp,
    'a=recvonly',
    `m=audio ${audioPort} RTP/AVP ${ac.payloadType}`,
    `a=rtpmap:${audioRtpmapValue}`,
    audioFmtp,
    'a=recvonly',
  ]
    .filter(Boolean)
    .join('\r\n')
}

// ─── Start FFmpeg ─────────────────────────────────────────────────────────────

export async function startFFmpegForPeer(
  peerId: string,
  videoPort: number,
  audioPort: number,
  videoRtpParameters: RtpParameters,
  audioRtpParameters: RtpParameters,
  srtPort: number,
  displayName: string
): Promise<ChildProcess> {
  const sdpContent = buildSdp(videoRtpParameters, audioRtpParameters, videoPort, audioPort)
  const sdpPath = path.join(os.tmpdir(), `vmix_peer_${peerId}.sdp`)
  fs.writeFileSync(sdpPath, sdpContent)

  const srtUrl = `srt://0.0.0.0:${srtPort}?mode=listener&latency=200&pbkeylen=0`

  const args = [
    '-loglevel',
    'warning',
    '-protocol_whitelist',
    'file,rtp,udp,crypto',
    '-i',
    sdpPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    // Video: H264 high profile, constrained for low latency
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-tune',
    'zerolatency',
    '-profile:v',
    'high',
    '-level:v',
    '4.2',
    '-b:v',
    '6000k',
    '-maxrate',
    '8000k',
    '-bufsize',
    '12000k',
    '-g',
    '60',
    '-keyint_min',
    '60',
    '-sc_threshold',
    '0',
    // Scale to 1080p, preserving aspect ratio, padding to exact 1920x1080
    '-vf',
    'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1',
    // Audio: AAC stereo
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-f',
    'mpegts',
    srtUrl,
  ]

  console.log(`[FFmpeg] Starting for "${displayName}" → srt://0.0.0.0:${srtPort}`)

  const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })

  proc.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) console.log(`[FFmpeg:${displayName}] ${line}`)
  })

  proc.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    // Suppress noisy progress lines
    if (line && !line.startsWith('frame=') && !line.includes('Last message repeated')) {
      console.log(`[FFmpeg:${displayName}] ${line}`)
    }
  })

  proc.on('exit', (code, signal) => {
    console.log(`[FFmpeg] Exit "${displayName}" code=${code} signal=${signal}`)
    ffmpegProcesses.delete(peerId)
    try {
      fs.unlinkSync(sdpPath)
    } catch {
      /* ignore */
    }
  })

  ffmpegProcesses.set(peerId, proc)
  return proc
}

// ─── Stop FFmpeg ──────────────────────────────────────────────────────────────

export function stopFFmpegForPeer(peerId: string): void {
  const proc = ffmpegProcesses.get(peerId)
  if (proc) {
    proc.kill('SIGINT')
    ffmpegProcesses.delete(peerId)
  }
  const sdpPath = path.join(os.tmpdir(), `vmix_peer_${peerId}.sdp`)
  try {
    fs.unlinkSync(sdpPath)
  } catch {
    /* ignore */
  }
}
