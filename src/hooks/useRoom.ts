import { useCallback, useEffect, useRef, useState } from 'react'
import { Device } from 'mediasoup-client'
import type { Transport, Producer, Consumer } from 'mediasoup-client/lib/types'
import { io, Socket } from 'socket.io-client'
import type {
  FrontendRoomDetail, ProducerDescriptor, RemoteParticipant,
  SrtSessionInfo, VideoPreset,
} from '../types'
import { DEFAULT_VIDEO_PRESET } from '../types'

const SERVER = String(import.meta.env.VITE_SIGNALING_URL ?? '').replace(/\/$/, '')
const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM as string ?? 'test'

const ROOM_POLL_MS = 4000

function capVideoFramerate(presetFps: number, track?: MediaStreamTrack | null): number {
  if (!track) return presetFps
  const f = track.getSettings().frameRate
  if (f != null && f > 0) return Math.min(presetFps, Math.round(f))
  return presetFps
}

/**
 * Simulcast как в типичном Meet: r0 / r1 / r2, scaleResolutionDownBy 4 / 2 / 1,
 * maxBitrate снизу вверх (SFU может выбирать слой под сеть; SRT/egress может брать один слой — см. бэкенд).
 */
function buildSimulcastEncodings(
  preset: VideoPreset,
  maxFramerate: number,
): { rid: string; scaleResolutionDownBy: number; maxBitrate: number; maxFramerate: number }[] {
  const cap = preset.maxBitrate
  return [
    { rid: 'r0', scaleResolutionDownBy: 4, maxBitrate: Math.max(80_000, Math.round(cap * 0.12)), maxFramerate },
    { rid: 'r1', scaleResolutionDownBy: 2, maxBitrate: Math.max(200_000, Math.round(cap * 0.32)), maxFramerate },
    { rid: 'r2', scaleResolutionDownBy: 1, maxBitrate: cap, maxFramerate },
  ]
}

function swapTrack(
  stream: MediaStream,
  kind: 'audio' | 'video',
  newTrack: MediaStreamTrack,
  setLocalStream: (s: MediaStream) => void,
) {
  const oldTracks = kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks()
  oldTracks.forEach((t: MediaStreamTrack) => { t.stop(); stream.removeTrack(t) })
  stream.addTrack(newTrack)
  setLocalStream(new MediaStream(stream.getTracks()))
}

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error'

export function useRoom() {
  const [status, setStatus] = useState<RoomStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [participants, setParticipants] = useState<Map<string, RemoteParticipant>>(new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [isCamOff, setIsCamOff] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const sendTransportRef = useRef<Transport | null>(null)
  const recvTransportRef = useRef<Transport | null>(null)
  const audioProducerRef = useRef<Producer | null>(null)
  const videoProducerRef = useRef<Producer | null>(null)
  const consumersRef = useRef<Map<string, Consumer>>(new Map())
  const roomIdRef = useRef<string>(DEFAULT_ROOM)
  const localStreamRef = useRef<MediaStream | null>(null)
  const [sessionMeta, setSessionMeta] = useState<{ roomId: string; localPeerId: string } | null>(null)
  const [srtByPeer, setSrtByPeer] = useState<Record<string, SrtSessionInfo>>({})
  const presetRef = useRef<VideoPreset>(DEFAULT_VIDEO_PRESET)
  const [activePreset, setActivePreset] = useState<VideoPreset>(DEFAULT_VIDEO_PRESET)

  // ─── Consume one producer ────────────────────────────────────────────────

  const consumeProducer = useCallback(async (producer: ProducerDescriptor) => {
    const device = deviceRef.current
    const recvTransport = recvTransportRef.current
    const socket = socketRef.current
    if (!device || !recvTransport || !socket) return

    const data = await new Promise<Record<string, unknown>>((res) => {
      socket.emit('consume', {
        roomId: roomIdRef.current,
        producerId: producer.producerId,
        transportId: recvTransport.id,
        rtpCapabilities: device.rtpCapabilities,
      }, res)
    })

    if (data?.error) {
      console.error('[consume] error:', data.error)
      return
    }

    const consumer = await recvTransport.consume(data as never)
    consumersRef.current.set(consumer.id, consumer)

    const stream = new MediaStream([consumer.track])

    setParticipants((prev) => {
      const next = new Map(prev)
      const existing: RemoteParticipant = next.get(producer.peerId) ?? {
        peerId: producer.peerId,
        name: producer.name,
      }
      if (consumer.kind === 'video') {
        next.set(producer.peerId, { ...existing, videoStream: stream })
      } else {
        next.set(producer.peerId, { ...existing, audioStream: stream })
      }
      return next
    })

    socket.emit(
      'resumeConsumer',
      { roomId: roomIdRef.current, consumerId: consumer.id },
      () => {}, // сервер ожидает Socket.IO ack — без колбэка падает callback is not a function
    )
  }, [])

  // ─── Join ────────────────────────────────────────────────────────────────

  const join = useCallback(async (name: string, roomId: string = DEFAULT_ROOM, preset?: VideoPreset) => {
    if (preset) { presetRef.current = preset; setActivePreset(preset) }
    const p = presetRef.current

    setStatus('connecting')
    setError(null)
    roomIdRef.current = roomId

    try {
      // 1. Get local media with requested resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width:     { ideal: p.width },
          height:    { ideal: p.height },
          frameRate: { ideal: p.frameRate },
        },
      })
      localStreamRef.current = stream
      setLocalStream(stream)

      // 2. Connect socket
      const socket = io(SERVER, { transports: ['websocket'] })
      socketRef.current = socket

      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      })

      setSessionMeta({ roomId: roomIdRef.current, localPeerId: socket.id ?? '' })

      // 3. Join room
      const joinData = await new Promise<{ rtpCapabilities: object; existingProducers: ProducerDescriptor[] }>((res) => {
        socket.emit('joinRoom', { roomId, name }, res)
      })

      console.log('[join] existingProducers:', joinData.existingProducers)

      // 4. Load mediasoup device
      const device = new Device()
      await device.load({ routerRtpCapabilities: joinData.rtpCapabilities as never })
      deviceRef.current = device

      // 5. Send transport
      const sendData = await new Promise<Record<string, unknown>>((res) => {
        socket.emit('createWebRtcTransport', { roomId }, res)
      })

      const sendTransport = device.createSendTransport(sendData as never)
      sendTransportRef.current = sendTransport

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('connectTransport', {
          roomId,
          transportId: sendTransport.id,
          dtlsParameters,
        }, (res: { error?: string }) => {
          if (res?.error) return errback(new Error(res.error))
          callback()
        })
      })

      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        socket.emit('produce', {
          roomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
        }, (res: { id?: string; error?: string }) => {
          if (res?.error) return errback(new Error(res.error))
          callback({ id: res.id! })
        })
      })

      // 6. Produce tracks (видео: simulcast; при отказе браузера — один слой)
      const codecOptions = { videoGoogleStartBitrate: p.startBitrate }
      for (const track of stream.getTracks()) {
        if (track.kind === 'video') {
          const fpsCap = capVideoFramerate(p.frameRate, track)
          let producer: Producer
          try {
            producer = await sendTransport.produce({
              track,
              encodings: buildSimulcastEncodings(p, fpsCap),
              codecOptions,
            })
          } catch (err) {
            console.warn('[produce] simulcast failed, fallback single encoding', err)
            producer = await sendTransport.produce({
              track,
              encodings: [{ maxBitrate: p.maxBitrate, maxFramerate: fpsCap }],
              codecOptions,
            })
          }
          videoProducerRef.current = producer
        } else {
          const producer = await sendTransport.produce({ track })
          audioProducerRef.current = producer
        }
      }

      // 7. Recv transport
      const recvData = await new Promise<Record<string, unknown>>((res) => {
        socket.emit('createWebRtcTransport', { roomId }, res)
      })

      const recvTransport = device.createRecvTransport(recvData as never)
      recvTransportRef.current = recvTransport

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('connectTransport', {
          roomId,
          transportId: recvTransport.id,
          dtlsParameters,
        }, (res: { error?: string }) => {
          if (res?.error) return errback(new Error(res.error))
          callback()
        })
      })

      // 8. Consume existing producers
      for (const p of joinData.existingProducers ?? []) {
        await consumeProducer(p)
      }

      // 9. Socket events
      socket.on('newProducer', async (producer: ProducerDescriptor) => {
        console.log('[newProducer]', producer)
        await consumeProducer(producer)
      })

      socket.on('peerLeft', ({ peerId }: { peerId: string }) => {
        setParticipants((prev) => {
          const next = new Map(prev)
          next.delete(peerId)
          return next
        })
        setSrtByPeer((prev) => {
          const n = { ...prev }
          delete n[peerId]
          return n
        })
      })

      socket.on('srtStarted', (data: SrtSessionInfo) => {
        if (!data?.peerId || !data.connectUrlPublic) return
        setSrtByPeer((prev) => ({
          ...prev,
          [data.peerId]: {
            peerId: data.peerId,
            roomId: data.roomId,
            sessionId: data.sessionId,
            listenPort: data.listenPort,
            connectUrlPublic: data.connectUrlPublic,
          },
        }))
      })

      setStatus('connected')
    } catch (err) {
      console.error('[join] error:', err)
      setError(String(err))
      setStatus('error')
      setSessionMeta(null)
      setSrtByPeer({})
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [consumeProducer])

  // Поллинг дашборда — подтягивает srt[] после рестарта сервера и синхронизирует состав
  const activeRoomId = sessionMeta?.roomId
  useEffect(() => {
    if (status !== 'connected' || !activeRoomId) return

    const mergeFromDetail = (data: FrontendRoomDetail) => {
      const rows = data.srt ?? []
      if (!rows.length) return
      setSrtByPeer((prev) => {
        const next = { ...prev }
        for (const row of rows) {
          if (row.peerId && row.connectUrlPublic) {
            next[row.peerId] = {
              peerId: row.peerId,
              roomId: data.roomId,
              sessionId: row.sessionId,
              listenPort: row.listenPort,
              connectUrlPublic: row.connectUrlPublic,
            }
          }
        }
        return next
      })
    }

    const tick = async () => {
      try {
        const res = await fetch(
          `${SERVER}/api/frontend/rooms/${encodeURIComponent(activeRoomId)}`,
        )
        if (!res.ok) return
        const data = (await res.json()) as FrontendRoomDetail
        mergeFromDetail(data)
      } catch {
        /* сеть / CORS */
      }
    }

    tick()
    const id = window.setInterval(tick, ROOM_POLL_MS)
    return () => clearInterval(id)
  }, [status, activeRoomId])

  // ─── Controls ────────────────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const producer = audioProducerRef.current
    const stream = localStream
    if (!producer || !stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    if (isMuted) {
      producer.resume()
      track.enabled = true
    } else {
      producer.pause()
      track.enabled = false
    }
    setIsMuted((v) => !v)
  }, [isMuted, localStream])

  const toggleCam = useCallback(() => {
    const producer = videoProducerRef.current
    const stream = localStream
    if (!producer || !stream) return
    const track = stream.getVideoTracks()[0]
    if (!track) return
    if (isCamOff) {
      producer.resume()
      track.enabled = true
    } else {
      producer.pause()
      track.enabled = false
    }
    setIsCamOff((v) => !v)
  }, [isCamOff, localStream])

  // ─── Device switching ────────────────────────────────────────────────────

  const switchCamera = useCallback(async (deviceId: string) => {
    const stream = localStreamRef.current
    const producer = videoProducerRef.current
    if (!stream) return

    const p = presetRef.current
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId:  { exact: deviceId },
        width:     { ideal: p.width },
        height:    { ideal: p.height },
        frameRate: { ideal: p.frameRate },
      },
    })
    const newTrack = newStream.getVideoTracks()[0]
    if (!newTrack) return

    swapTrack(stream, 'video', newTrack, setLocalStream)
    if (producer) await producer.replaceTrack({ track: newTrack })
  }, [])

  const switchMic = useCallback(async (deviceId: string) => {
    const stream = localStreamRef.current
    const producer = audioProducerRef.current
    if (!stream) return

    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    })
    const newTrack = newStream.getAudioTracks()[0]
    if (!newTrack) return

    swapTrack(stream, 'audio', newTrack, setLocalStream)
    if (producer) await producer.replaceTrack({ track: newTrack })
    if (isMuted) newTrack.enabled = false
  }, [isMuted])

  /** Смена пресета на лету — перезапрос камеры + обновление encodings */
  const changePreset = useCallback(async (preset: VideoPreset) => {
    presetRef.current = preset
    setActivePreset(preset)

    const stream = localStreamRef.current
    const producer = videoProducerRef.current
    if (!stream || !producer) return

    const currentVideoTrack = stream.getVideoTracks()[0]
    const currentDeviceId = currentVideoTrack?.getSettings().deviceId

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...(currentDeviceId ? { deviceId: { exact: currentDeviceId } } : {}),
        width:     { ideal: preset.width },
        height:    { ideal: preset.height },
        frameRate: { ideal: preset.frameRate },
      },
    })
    const newTrack = newStream.getVideoTracks()[0]
    if (!newTrack) return

    swapTrack(stream, 'video', newTrack, setLocalStream)
    await producer.replaceTrack({ track: newTrack })

    const sender = producer.rtpSender
    if (sender) {
      const fpsCap = capVideoFramerate(preset.frameRate, newTrack)
      const layered = buildSimulcastEncodings(preset, fpsCap)
      const params = sender.getParameters()
      const encs = params.encodings
      if (encs && encs.length >= 3) {
        layered.forEach((layer, i) => {
          encs[i].maxBitrate = layer.maxBitrate
          encs[i].maxFramerate = layer.maxFramerate
        })
      } else if (encs && encs.length >= 1) {
        encs[0].maxBitrate = preset.maxBitrate
        encs[0].maxFramerate = fpsCap
      } else {
        params.encodings = [{ maxBitrate: preset.maxBitrate, maxFramerate: fpsCap }]
      }
      await sender.setParameters(params)
    }
  }, [])

  const leave = useCallback(() => {
    videoProducerRef.current?.close()
    audioProducerRef.current?.close()
    consumersRef.current.forEach((c) => c.close())
    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    socketRef.current?.disconnect()
    localStream?.getTracks().forEach((t) => t.stop())
    setLocalStream(null)
    setParticipants(new Map())
    setStatus('idle')
    setIsMuted(false)
    setIsCamOff(false)
    setSessionMeta(null)
    setSrtByPeer({})
  }, [localStream])

  return {
    join,
    leave,
    toggleMute,
    toggleCam,
    switchCamera,
    switchMic,
    changePreset,
    activePreset,
    status,
    error,
    localStream,
    participants,
    isMuted,
    isCamOff,
    roomId: sessionMeta?.roomId ?? null,
    localPeerId: sessionMeta?.localPeerId ?? null,
    srtByPeer,
  }
}
