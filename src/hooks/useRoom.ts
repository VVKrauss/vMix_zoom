import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Device } from 'mediasoup-client'
import type { Transport, Producer, Consumer } from 'mediasoup-client/lib/types'
import { io, Socket } from 'socket.io-client'
import type {
  FrontendRoomDetail, ProducerDescriptor, RemoteParticipant,
  SrtSessionInfo, VideoPreset,
} from '../types'
import type { RoomChatMessage, RoomReactionBurst, RoomReactionEvent } from '../types/roomComms'
import {
  CHAT_MESSAGE_MAX_LEN,
  CHAT_MESSAGES_CAP,
  REACTION_EMOJI_WHITELIST,
  REACTION_TTL_DEFAULT_MS,
} from '../types/roomComms'
import { resolveVideoProducerRole } from '../utils/producerVideoRole'
import { signalingHttpBase, signalingSocketUrl } from '../utils/signalingBase'
import { DEFAULT_VIDEO_PRESET } from '../types'

const SIGNALING_HTTP = signalingHttpBase()
const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM as string ?? 'test'

const ROOM_POLL_MS = 4000

/** Совпадение с недавним локальным сообщением (оптимистичным) — заменяем серверной версией. */
const CHAT_ECHO_DEDUP_MS = 12_000
const CHAT_ECHO_DEDUP_SCAN = 48

function mergeIncomingChatMessage(prev: RoomChatMessage[], msg: RoomChatMessage): RoomChatMessage[] {
  if (msg.kind === 'reaction') {
    return [...prev, msg].slice(-CHAT_MESSAGES_CAP)
  }
  const scan = Math.min(CHAT_ECHO_DEDUP_SCAN, prev.length)
  for (let k = 1; k <= scan; k++) {
    const i = prev.length - k
    const p = prev[i]!
    if (
      p.peerId === msg.peerId &&
      p.text === msg.text &&
      Math.abs(p.ts - msg.ts) < CHAT_ECHO_DEDUP_MS
    ) {
      const next = [...prev]
      next[i] = msg
      return next.slice(-CHAT_MESSAGES_CAP)
    }
  }
  return [...prev, msg].slice(-CHAT_MESSAGES_CAP)
}

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

/** Закрыть socket.io-клиент; при незавершённом handshake `disconnect()` часто даёт лишний шум в консоли браузера. */
function disposeSignalingSocket(s: Socket) {
  try {
    s.removeAllListeners()
    if (s.connected) {
      s.disconnect()
      return
    }
    const engine = s.io?.engine
    if (engine && typeof engine.close === 'function') {
      engine.removeAllListeners?.()
      engine.close()
      return
    }
    s.disconnect()
  } catch {
    /* noop */
  }
}

export type RoomStatus = 'idle' | 'connecting' | 'connected' | 'error'

export type RoomActivityNotifyRef = MutableRefObject<{
  isChatClosed: () => boolean
  bumpUnread: () => void
}>

export function useRoom(activityNotifyRef?: RoomActivityNotifyRef) {
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
  const screenProducerRef = useRef<Producer | null>(null)
  const localScreenStreamRef = useRef<MediaStream | null>(null)
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const consumersRef = useRef<Map<string, Consumer>>(new Map())
  /** producerId → метаданные для producerClosed и очистки */
  const producerMetaRef = useRef<Map<string, {
    consumerId: string
    peerId: string
    kind: 'audio' | 'video'
    videoSource?: 'camera' | 'screen'
  }>>(new Map())
  const roomIdRef = useRef<string>(DEFAULT_ROOM)
  const localStreamRef = useRef<MediaStream | null>(null)
  const [sessionMeta, setSessionMeta] = useState<{ roomId: string; localPeerId: string } | null>(null)
  const [srtByPeer, setSrtByPeer] = useState<Record<string, SrtSessionInfo>>({})
  const presetRef = useRef<VideoPreset>(DEFAULT_VIDEO_PRESET)
  const [activePreset, setActivePreset] = useState<VideoPreset>(DEFAULT_VIDEO_PRESET)

  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([])
  const [reactionBursts, setReactionBursts] = useState<RoomReactionBurst[]>([])
  const lastLocalReactionAtRef = useRef(0)
  const displayNameRef = useRef('')
  /** Инкремент при leave или новом join — отмена незавершённого join без ложных ошибок в консоли. */
  const joinGenerationRef = useRef(0)
  const participantsRef = useRef(participants)
  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

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

      if (consumer.kind === 'audio') {
        producerMetaRef.current.set(producer.producerId, {
          consumerId: consumer.id,
          peerId: producer.peerId,
          kind: 'audio',
        })
        next.set(producer.peerId, { ...existing, audioStream: stream })
        return next
      }

      const resolved = resolveVideoProducerRole(producer, !!existing.videoStream)

      producerMetaRef.current.set(producer.producerId, {
        consumerId: consumer.id,
        peerId: producer.peerId,
        kind: 'video',
        videoSource: resolved,
      })

      if (resolved === 'screen') {
        next.set(producer.peerId, { ...existing, screenStream: stream })
      } else {
        next.set(producer.peerId, { ...existing, videoStream: stream })
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

    joinGenerationRef.current += 1
    const gen = joinGenerationRef.current

    setStatus('connecting')
    setError(null)
    roomIdRef.current = roomId
    displayNameRef.current = name.trim() || 'Гость'

    const aborted = () => gen !== joinGenerationRef.current

    const stopStreamTracks = (stream: MediaStream | null) => {
      stream?.getTracks().forEach((t) => t.stop())
    }

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
      if (aborted()) {
        stopStreamTracks(stream)
        setStatus('idle')
        return
      }
      localStreamRef.current = stream
      setLocalStream(stream)

      // 2. Connect socket
      // Сначала long-polling — стабильнее через Vite proxy; затем upgrade до WebSocket.
      const socket = io(signalingSocketUrl(), { transports: ['polling', 'websocket'] })
      socketRef.current = socket

      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          socket.off('connect', onConnect)
          socket.off('connect_error', onErr)
          socket.off('disconnect', onDisconnect)
          resolve()
        }
        const onErr = (e: Error) => {
          socket.off('connect', onConnect)
          socket.off('connect_error', onErr)
          socket.off('disconnect', onDisconnect)
          reject(e)
        }
        const onDisconnect = (reason: string) => {
          socket.off('connect', onConnect)
          socket.off('connect_error', onErr)
          socket.off('disconnect', onDisconnect)
          reject(new Error(reason === 'io client disconnect' ? 'aborted' : (reason || 'disconnect')))
        }
        socket.once('connect', onConnect)
        socket.once('connect_error', onErr)
        socket.once('disconnect', onDisconnect)
      })

      if (aborted()) {
        stopStreamTracks(stream)
        disposeSignalingSocket(socket)
        if (socketRef.current === socket) socketRef.current = null
        localStreamRef.current = null
        setLocalStream(null)
        setStatus('idle')
        return
      }

      setSessionMeta({ roomId: roomIdRef.current, localPeerId: socket.id ?? '' })

      // 3. Join room
      const joinData = await new Promise<{
        rtpCapabilities: object
        existingProducers?: ProducerDescriptor[]
        chatHistory?: RoomChatMessage[]
      }>((res) => {
        socket.emit('joinRoom', { roomId, name }, res)
      })

      if (aborted()) {
        stopStreamTracks(stream)
        disposeSignalingSocket(socket)
        if (socketRef.current === socket) socketRef.current = null
        localStreamRef.current = null
        setLocalStream(null)
        setStatus('idle')
        return
      }

      console.log('[join] existingProducers:', joinData.existingProducers)

      if (Array.isArray(joinData.chatHistory)) {
        const h = joinData.chatHistory
          .filter(
            (m): m is RoomChatMessage =>
              !!m &&
              typeof m.peerId === 'string' &&
              typeof m.name === 'string' &&
              typeof m.text === 'string' &&
              typeof m.ts === 'number',
          )
          .slice(-CHAT_MESSAGES_CAP)
        setChatMessages(h)
      } else {
        setChatMessages([])
      }
      setReactionBursts([])

      // 4. Load mediasoup device
      const device = new Device()
      await device.load({ routerRtpCapabilities: joinData.rtpCapabilities as never })
      if (aborted()) {
        stopStreamTracks(stream)
        disposeSignalingSocket(socket)
        if (socketRef.current === socket) socketRef.current = null
        deviceRef.current = null
        localStreamRef.current = null
        setLocalStream(null)
        setStatus('idle')
        return
      }
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

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        socket.emit('produce', {
          roomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData: appData ?? {},
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

      const dropProducerById = (producerId: string) => {
        const meta = producerMetaRef.current.get(producerId)
        if (!meta) return
        const c = consumersRef.current.get(meta.consumerId)
        try {
          c?.close()
        } catch {
          /* noop */
        }
        consumersRef.current.delete(meta.consumerId)
        producerMetaRef.current.delete(producerId)

        setParticipants((prev) => {
          const next = new Map(prev)
          const p = next.get(meta.peerId)
          if (!p) return next
          if (meta.kind === 'audio') {
            next.set(meta.peerId, { ...p, audioStream: undefined })
          } else if (meta.videoSource === 'screen') {
            next.set(meta.peerId, { ...p, screenStream: undefined })
          } else {
            next.set(meta.peerId, { ...p, videoStream: undefined })
          }
          return next
        })
      }

      socket.on('producerClosed', (payload: { producerId?: string }) => {
        const id = payload?.producerId
        if (id) dropProducerById(id)
      })

      socket.on('peerLeft', ({ peerId }: { peerId: string }) => {
        producerMetaRef.current.forEach((meta, prodId) => {
          if (meta.peerId !== peerId) return
          const c = consumersRef.current.get(meta.consumerId)
          try {
            c?.close()
          } catch {
            /* noop */
          }
          consumersRef.current.delete(meta.consumerId)
          producerMetaRef.current.delete(prodId)
        })
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

      const maybeBumpUnread = (fromPeerId: string) => {
        const sid = socket.id
        const nr = activityNotifyRef?.current
        if (!sid || fromPeerId === sid || !nr?.isChatClosed()) return
        nr.bumpUnread()
      }

      const appendChat = (msg: RoomChatMessage) => {
        if (msg.roomId && msg.roomId !== roomIdRef.current) return
        maybeBumpUnread(msg.peerId)
        setChatMessages((prev) => mergeIncomingChatMessage(prev, msg))
      }

      socket.on('chat:message', (raw: unknown) => {
        const m = raw as Partial<RoomChatMessage>
        if (!m?.peerId || typeof m.name !== 'string' || typeof m.text !== 'string' || typeof m.ts !== 'number') return
        appendChat(m as RoomChatMessage)
      })

      socket.on('reaction', (raw: unknown) => {
        const r = raw as Partial<RoomReactionEvent>
        if (!r?.peerId || typeof r.emoji !== 'string') return
        if (r.roomId && r.roomId !== roomIdRef.current) return
        maybeBumpUnread(r.peerId)
        const ttl =
          typeof r.ttlMs === 'number' && r.ttlMs > 0 ? Math.min(r.ttlMs, 10_000) : REACTION_TTL_DEFAULT_MS
        const id =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`
        const burst: RoomReactionBurst = { id, peerId: r.peerId, emoji: r.emoji }
        setReactionBursts((prev) => [...prev, burst].slice(-50))
        window.setTimeout(() => {
          setReactionBursts((prev) => prev.filter((b) => b.id !== id))
        }, ttl)

        const sid = socket.id
        const rname =
          r.peerId === sid
            ? displayNameRef.current
            : (participantsRef.current.get(r.peerId)?.name ?? 'Участник')
        const rts = typeof r.ts === 'number' ? r.ts : Date.now()
        const reactionLine: RoomChatMessage = {
          peerId: r.peerId,
          name: rname,
          text: r.emoji,
          ts: rts,
          kind: 'reaction',
          roomId: roomIdRef.current,
        }
        setChatMessages((prev) => [...prev, reactionLine].slice(-CHAT_MESSAGES_CAP))
      })

      setStatus('connected')
    } catch (err) {
      if (gen !== joinGenerationRef.current) {
        return
      }
      console.error('[join] error:', err)
      setError(String(err))
      setStatus('error')
      setSessionMeta(null)
      setSrtByPeer({})
      setChatMessages([])
      setReactionBursts([])
      const s = socketRef.current
      socketRef.current = null
      if (s) disposeSignalingSocket(s)
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
          `${SIGNALING_HTTP}/api/frontend/rooms/${encodeURIComponent(activeRoomId)}`,
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

  const stopScreenShare = useCallback(() => {
    screenProducerRef.current?.close()
    screenProducerRef.current = null
    localScreenStreamRef.current?.getTracks().forEach((t) => t.stop())
    localScreenStreamRef.current = null
    setLocalScreenStream(null)
    setIsScreenSharing(false)
  }, [])

  /** Подсказка диалогу getDisplayMedia: весь экран / окно / вкладка (где поддерживается). */
  const startScreenShare = useCallback(
    async (surface?: 'monitor' | 'window' | 'browser') => {
      if (screenProducerRef.current) return
      const sendTransport = sendTransportRef.current
      if (!sendTransport) return
      try {
        const video: Record<string, unknown> = {
          frameRate: { max: 30 },
        }
        if (surface) video.displaySurface = surface
        const opts: Record<string, unknown> = {
          video,
          audio: false,
          preferCurrentTab: false,
        }
        const stream = await navigator.mediaDevices.getDisplayMedia(opts as DisplayMediaStreamOptions)
        const track = stream.getVideoTracks()[0]
        if (!track) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        localScreenStreamRef.current = stream
        setLocalScreenStream(stream)
        track.addEventListener('ended', () => {
          stopScreenShare()
        })
        const producer = await sendTransport.produce({
          track,
          appData: { source: 'screen' },
          encodings: [{ maxBitrate: 4_000_000, maxFramerate: 30 }],
        })
        screenProducerRef.current = producer
        setIsScreenSharing(true)
      } catch {
        localScreenStreamRef.current?.getTracks().forEach((t) => t.stop())
        localScreenStreamRef.current = null
        setLocalScreenStream(null)
      }
    },
    [stopScreenShare],
  )

  const toggleScreenShare = useCallback(async () => {
    if (screenProducerRef.current) {
      stopScreenShare()
      return
    }
    await startScreenShare(undefined)
  }, [stopScreenShare, startScreenShare])

  const sendChatMessage = useCallback((text: string) => {
    const socket = socketRef.current
    if (!socket?.connected) return
    const trimmed = text.trim().slice(0, CHAT_MESSAGE_MAX_LEN)
    if (!trimmed) return
    const peerId = socket.id
    if (!peerId) return
    const optimistic: RoomChatMessage = {
      peerId,
      name: displayNameRef.current,
      text: trimmed,
      ts: Date.now(),
      roomId: roomIdRef.current,
    }
    setChatMessages((prev) => [...prev, optimistic].slice(-CHAT_MESSAGES_CAP))
    socket.emit('chat:message', { roomId: roomIdRef.current, text: trimmed })
  }, [])

  const sendReaction = useCallback((emoji: string) => {
    if (!REACTION_EMOJI_WHITELIST.includes(emoji as (typeof REACTION_EMOJI_WHITELIST)[number])) return
    const now = Date.now()
    if (now - lastLocalReactionAtRef.current < 700) return
    lastLocalReactionAtRef.current = now
    const socket = socketRef.current
    if (!socket) return
    socket.emit('reaction', {
      roomId: roomIdRef.current,
      emoji,
      ttlMs: REACTION_TTL_DEFAULT_MS,
    })
  }, [])

  const leave = useCallback(() => {
    joinGenerationRef.current += 1
    stopScreenShare()
    videoProducerRef.current?.close()
    audioProducerRef.current?.close()
    consumersRef.current.forEach((c) => c.close())
    consumersRef.current.clear()
    producerMetaRef.current.clear()
    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    const s = socketRef.current
    socketRef.current = null
    if (s) disposeSignalingSocket(s)
    localStream?.getTracks().forEach((t) => t.stop())
    setLocalStream(null)
    setParticipants(new Map())
    setStatus('idle')
    setIsMuted(false)
    setIsCamOff(false)
    setSessionMeta(null)
    setSrtByPeer({})
    setChatMessages([])
    setReactionBursts([])
  }, [localStream, stopScreenShare])

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
    localScreenStream,
    isScreenSharing,
    toggleScreenShare,
    startScreenShare,
    participants,
    isMuted,
    isCamOff,
    roomId: sessionMeta?.roomId ?? null,
    localPeerId: sessionMeta?.localPeerId ?? null,
    srtByPeer,
    chatMessages,
    sendChatMessage,
    sendReaction,
    reactionBursts,
  }
}
