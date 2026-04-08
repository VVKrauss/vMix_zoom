import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Device } from 'mediasoup-client'
import type { Transport, Producer, Consumer, RtpCapabilities, TransportOptions, ConsumerOptions } from 'mediasoup-client/lib/types'
import { io, Socket } from 'socket.io-client'
import type {
  FrontendRoomDetail, ProducerDescriptor, RemoteParticipant,
  SrtSessionInfo, VideoPreset, VmixIngressInfo,
} from '../types'
import type { RoomChatMessage, RoomReactionBurst, RoomReactionEvent } from '../types/roomComms'
import {
  CHAT_MESSAGE_MAX_LEN,
  CHAT_MESSAGES_CAP,
  isScreenShareChatNotice,
  REACTION_EMOJI_WHITELIST,
  REACTION_TTL_DEFAULT_MS,
} from '../types/roomComms'
import {
  resolveConsumeVideoRole,
  videoAnchorPeerId,
} from '../utils/producerVideoRole'
import { readVmixIngressEmitExtras } from '../config/serverSettingsStorage'
import {
  applyEma,
  buildQuality,
  type InboundVideoQuality,
} from '../utils/inboundVideoStats'
import {
  deltaUplinkFromSamples,
  pickUplinkVideoPair,
  sampleFromUplinkPair,
  type UplinkVideoStatsSample,
} from '../utils/uplinkVideoStats'
import { signalingHttpBase, signalingSocketUrl } from '../utils/signalingBase'
import {
  getStoredVideoPreset,
  persistVideoPreset,
  readPreferredCameraId,
  readPreferredMicId,
} from '../config/roomUiStorage'
import { formatMediaJoinError } from '../utils/formatMediaJoinError'
import type { StudioOutputPreset } from '../types/studio'

const SIGNALING_HTTP = signalingHttpBase()
const DEFAULT_ROOM = import.meta.env.VITE_DEFAULT_ROOM as string ?? 'test'

const ROOM_POLL_MS = 4000

/** Совпадение с недавним локальным сообщением (оптимистичным) — заменяем серверной версией. */
const CHAT_ECHO_DEDUP_MS = 12_000
const CHAT_ECHO_DEDUP_SCAN = 48

function extractField(payload: unknown, camel: string, snake: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  const o = payload as Record<string, unknown>
  const v = o[camel] ?? o[snake]
  if (v == null) return undefined
  const s = String(v).trim()
  return s || undefined
}

const producerIdFromClosedPayload = (p: unknown) => extractField(p, 'producerId', 'producer_id')
const peerIdFromLeftPayload = (p: unknown) => extractField(p, 'peerId', 'peer_id')

type PeerRosterRow = { peerId: string; name: string; avatarUrl?: string | null }

function parsePeerRosterRow(raw: unknown): PeerRosterRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const peerId =
    typeof o.peerId === 'string'
      ? o.peerId.trim()
      : typeof o.peer_id === 'string'
        ? o.peer_id.trim()
        : ''
  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (!peerId || !name) return null
  const av = o.avatarUrl ?? o.avatar_url
  let avatarUrl: string | null | undefined
  if (av === null) avatarUrl = null
  else if (typeof av === 'string' && av.trim()) avatarUrl = av.trim()
  return { peerId, name, avatarUrl }
}

function applyRosterRow(
  next: Map<string, RemoteParticipant>,
  row: PeerRosterRow,
  selfSocketId: string,
): void {
  if (row.peerId === selfSocketId) return
  const ex = next.get(row.peerId)
  next.set(row.peerId, {
    peerId: row.peerId,
    name: row.name,
    avatarUrl: row.avatarUrl ?? ex?.avatarUrl ?? null,
    audioStream: ex?.audioStream,
    videoStream: ex?.videoStream,
    screenStream: ex?.screenStream,
    screenPeerId: ex?.screenPeerId,
  })
}

type ProducerMeta = {
  consumerId: string
  anchorPeerId: string
  producerPeerId: string
  kind: 'audio' | 'video'
  videoSource?: 'camera' | 'screen' | 'vmix'
}

function registerProducerMeta(
  map: Map<string, ProducerMeta>,
  signalingProducerId: string,
  consumerProducerId: string,
  meta: ProducerMeta,
) {
  const sig = String(signalingProducerId).trim()
  const cPid = String(consumerProducerId).trim()
  map.set(sig, meta)
  if (cPid && cPid !== sig) {
    map.set(cPid, meta)
  }
}

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

function parseVideoUplinkBroadcast(raw: unknown): InboundVideoQuality | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const bitrateBps = Number(o.bitrateBps ?? o.bitrate_bps)
  const fractionLost = Number(o.fractionLost ?? o.fraction_lost)
  if (!Number.isFinite(bitrateBps) || !Number.isFinite(fractionLost)) return null
  const j = o.jitterMs ?? o.jitter_ms
  const jitterMs = j == null || j === '' ? null : Number(j)
  return buildQuality(
    bitrateBps,
    fractionLost,
    jitterMs != null && Number.isFinite(jitterMs) ? jitterMs : null,
  )
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

async function produceVideoFromTrack(
  sendTransport: Transport,
  track: MediaStreamTrack,
  preset: VideoPreset,
): Promise<Producer> {
  const fpsCap = capVideoFramerate(preset.frameRate, track)
  const codecOptions = { videoGoogleStartBitrate: preset.startBitrate }
  try {
    return await sendTransport.produce({
      track,
      encodings: buildSimulcastEncodings(preset, fpsCap),
      codecOptions,
    })
  } catch (err) {
    console.warn('[produce] simulcast failed, fallback single encoding', err)
    return sendTransport.produce({
      track,
      encodings: [{ maxBitrate: preset.maxBitrate, maxFramerate: fpsCap }],
      codecOptions,
    })
  }
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

/** Вход в комнату: какие дорожки запросить до подключения (остальное — кнопками в комнате). */
export type { InboundVideoQuality } from '../utils/inboundVideoStats'

export type JoinRoomMediaOptions = {
  enableMic: boolean
  enableCam: boolean
  avatarUrl?: string | null
  authUserId?: string | null
}

export type RoomActivityNotifyRef = MutableRefObject<{
  isChatClosed: () => boolean
  bumpUnread: () => void
  /** Всплывашка нового сообщения (только при закрытом чате; не для реакций). */
  flashChatPreview?: (author: string, text: string) => void
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
  const studioProgramVideoProducerRef = useRef<Producer | null>(null)
  const studioProgramAudioProducerRef = useRef<Producer | null>(null)
  const localScreenStreamRef = useRef<MediaStream | null>(null)
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  /** Отдельный peerId демонстрации с бэка (ack produce); для соло-URL и SRT. */
  const [localScreenPeerId, setLocalScreenPeerId] = useState<string | null>(null)
  const consumersRef = useRef<Map<string, Consumer>>(new Map())
  /** producerId → метаданные для producerClosed и очистки */
  const producerMetaRef = useRef<Map<string, ProducerMeta>>(new Map())
  /** Локальное видео → SFU: одна цепочка сэмплов + EMA (и для UI, и для reportVideoUplink). */
  const uplinkLocalPrevRef = useRef<UplinkVideoStatsSample | undefined>(undefined)
  const uplinkLocalEmaRef = useRef<Map<string, { bitrateBps: number; fractionLost: number }>>(new Map())
  const lastVideoUplinkEmitAtRef = useRef(0)
  /** Чужие uplink-метрики с сигналинга (broadcast после reportVideoUplink). */
  const peerUplinkVideoQualityRef = useRef<Record<string, InboundVideoQuality>>({})
  const [peerUplinkBroadcastTick, setPeerUplinkBroadcastTick] = useState(0)
  const roomIdRef = useRef<string>(DEFAULT_ROOM)
  const localStreamRef = useRef<MediaStream | null>(null)
  const [sessionMeta, setSessionMeta] = useState<{ roomId: string; localPeerId: string } | null>(null)
  const [srtByPeer, setSrtByPeer] = useState<Record<string, SrtSessionInfo>>({})
  const initialPreset = getStoredVideoPreset()
  const presetRef = useRef<VideoPreset>(initialPreset)
  const [activePreset, setActivePreset] = useState<VideoPreset>(initialPreset)

  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([])
  const [reactionBursts, setReactionBursts] = useState<RoomReactionBurst[]>([])
  /** Пока consume удалённого экрана не завершился — раскладка meet у гостей */
  const [remoteScreenConsumePending, setRemoteScreenConsumePending] = useState(false)
  const [vmixIngressInfo, setVmixIngressInfo] = useState<VmixIngressInfo | null>(null)
  /** Эфир «Студии» на RTMP (состояние UI + опционально `studioBroadcastHealth` с signaling). */
  const [studioBroadcastHealth, setStudioBroadcastHealth] = useState<
    'idle' | 'connecting' | 'live' | 'warning'
  >('idle')
  const lastLocalReactionAtRef = useRef(0)
  const displayNameRef = useRef('')
  /** Инкремент при leave или новом join — отмена незавершённого join без ложных ошибок в консоли. */
  const joinGenerationRef = useRef(0)
  const participantsRef = useRef(participants)
  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

  const remoteScreenConsumePendingRef = useRef(false)
  useEffect(() => {
    remoteScreenConsumePendingRef.current = remoteScreenConsumePending
  }, [remoteScreenConsumePending])

  const stripScreenChatForPeer = useCallback((presenterPeerId: string) => {
    if (!presenterPeerId) return
    setChatMessages((prev) =>
      prev.filter(
        (m) =>
          m.kind === 'reaction' ||
          m.peerId !== presenterPeerId ||
          !isScreenShareChatNotice(m.text),
      ),
    )
  }, [])

  const dropProducerById = useCallback(
    (rawProducerId: string) => {
      const producerId = String(rawProducerId ?? '').trim()
      if (!producerId) return

      if (import.meta.env.DEV) {
        console.log('[dropProducerById] looking for', producerId,
          '| meta keys:', [...producerMetaRef.current.keys()],
          '| consumers:', [...consumersRef.current.entries()].map(([cid, c]) => ({ cid, cProducerId: c.producerId, closed: c.closed })),
        )
      }

      let meta = producerMetaRef.current.get(producerId)
      if (!meta) {
        for (const m of producerMetaRef.current.values()) {
          const c = consumersRef.current.get(m.consumerId)
          if (c && String(c.producerId) === producerId) {
            meta = m
            break
          }
        }
      }
      if (!meta) {
        if (import.meta.env.DEV) console.warn('[dropProducerById] NO META FOUND for', producerId)
        return
      }
      if (import.meta.env.DEV) console.log('[dropProducerById] found meta', { ...meta })

      const c = consumersRef.current.get(meta.consumerId)
      try {
        c?.close()
      } catch {
        /* noop */
      }
      consumersRef.current.delete(meta.consumerId)

      for (const [k, m] of [...producerMetaRef.current.entries()]) {
        if (m.consumerId === meta.consumerId) {
          producerMetaRef.current.delete(k)
        }
      }

      setParticipants((prev) => {
        const next = new Map(prev)
        const p = next.get(meta.anchorPeerId)
        if (!p) return next
        const cleared: Partial<RemoteParticipant> =
          meta.kind === 'audio' ? { audioStream: undefined }
          : meta.videoSource === 'screen' ? { screenStream: undefined, screenPeerId: undefined }
          : { videoStream: undefined }
        const updated = { ...p, ...cleared }
        next.set(meta.anchorPeerId, updated)
        return next
      })

      if (meta.kind === 'video' && meta.videoSource === 'screen') {
        stripScreenChatForPeer(meta.anchorPeerId)
      }
    },
    [stripScreenChatForPeer],
  )

  // ─── Consume one producer ────────────────────────────────────────────────

  const consumeProducer = useCallback(
    async (producer: ProducerDescriptor) => {
      const device = deviceRef.current
      const recvTransport = recvTransportRef.current
      const socket = socketRef.current
      if (!device || !recvTransport || !socket) return

      let endRemoteScreenPending: (() => void) | undefined
      if (producer.kind === 'video') {
        const aid = videoAnchorPeerId(producer)
        const ex = participantsRef.current.get(aid)
        if (resolveConsumeVideoRole(producer, !!ex?.videoStream) === 'screen') {
          setRemoteScreenConsumePending(true)
          endRemoteScreenPending = () => setRemoteScreenConsumePending(false)
        }
      }

      try {
        const data = await new Promise<Record<string, unknown>>((res) => {
          socket.emit(
            'consume',
            {
              roomId: roomIdRef.current,
              producerId: producer.producerId,
              transportId: recvTransport.id,
              rtpCapabilities: device.rtpCapabilities,
            },
            res,
          )
        })

        if (data?.error) {
          console.error('[consume] error:', data.error)
          return
        }

        const consumer = await recvTransport.consume(data as ConsumerOptions)
        consumersRef.current.set(consumer.id, consumer)

        if (import.meta.env.DEV) {
          console.log('[consumeProducer] IDs:',
            'signaling=', producer.producerId,
            'consumer.producerId=', consumer.producerId,
            'consumer.id=', consumer.id,
            'kind=', consumer.kind,
            'descriptor=', producer,
          )
        }

        const stream = new MediaStream([consumer.track])

        const signalingProducerId = producer.producerId
        const onConsumerDead = () => {
          dropProducerById(signalingProducerId)
          if (consumer.producerId !== signalingProducerId) {
            dropProducerById(consumer.producerId)
          }
        }
        consumer.on('trackended', onConsumerDead)
        consumer.on('transportclose', onConsumerDead)

        setParticipants((prev) => {
          const next = new Map(prev)

          if (consumer.kind === 'audio') {
            const anchorId = producer.peerId
            const existing: RemoteParticipant = next.get(anchorId) ?? {
              peerId: anchorId,
              name: producer.name,
              avatarUrl: producer.avatarUrl ?? undefined,
            }
            const audioMeta = {
              consumerId: consumer.id,
              anchorPeerId: anchorId,
              producerPeerId: producer.peerId,
              kind: 'audio' as const,
            }
            registerProducerMeta(producerMetaRef.current, producer.producerId, consumer.producerId, audioMeta)
            next.set(anchorId, {
              ...existing,
              name: producer.name || existing.name,
              avatarUrl: producer.avatarUrl ?? existing.avatarUrl ?? null,
              audioStream: stream,
            })
            return next
          }

          const anchorId = videoAnchorPeerId(producer)
          const existing: RemoteParticipant = next.get(anchorId) ?? {
            peerId: anchorId,
            name: producer.name,
            avatarUrl: producer.avatarUrl ?? undefined,
          }

          const resolved = resolveConsumeVideoRole(producer, !!existing.videoStream)

          const videoMeta = {
            consumerId: consumer.id,
            anchorPeerId: anchorId,
            producerPeerId: producer.peerId,
            kind: 'video' as const,
            videoSource: resolved,
          }
          registerProducerMeta(producerMetaRef.current, producer.producerId, consumer.producerId, videoMeta)

          if (resolved === 'screen') {
            const distinct = producer.peerId !== anchorId ? producer.peerId : undefined
            next.set(anchorId, {
              ...existing,
              name: producer.name || existing.name,
              avatarUrl: producer.avatarUrl ?? existing.avatarUrl ?? null,
              screenStream: stream,
              ...(distinct ? { screenPeerId: distinct } : { screenPeerId: undefined }),
            })
          } else {
            next.set(anchorId, {
              ...existing,
              name: producer.name || existing.name,
              avatarUrl: producer.avatarUrl ?? existing.avatarUrl ?? null,
              videoStream: stream,
            })
          }
          return next
        })

        socket.emit(
          'resumeConsumer',
          { roomId: roomIdRef.current, consumerId: consumer.id },
          () => {}, // сервер ожидает Socket.IO ack — без колбэка падает callback is not a function
        )
      } finally {
        endRemoteScreenPending?.()
      }
    },
    [dropProducerById],
  )

  // ─── Join ────────────────────────────────────────────────────────────────

  const join = useCallback(async (
    name: string,
    roomId: string = DEFAULT_ROOM,
    preset?: VideoPreset,
    media?: JoinRoomMediaOptions,
  ) => {
    if (preset) {
      presetRef.current = preset
      setActivePreset(preset)
      persistVideoPreset(preset)
    }
    const p = presetRef.current
    const wantMic = media?.enableMic !== false
    const wantCam = media?.enableCam !== false

    joinGenerationRef.current += 1
    const gen = joinGenerationRef.current

    setStatus('connecting')
    setError(null)
    setLocalScreenPeerId(null)
    setRemoteScreenConsumePending(false)
    roomIdRef.current = roomId
    displayNameRef.current = name.trim() || 'Гость'

    const aborted = () => gen !== joinGenerationRef.current

    const stopStreamTracks = (stream: MediaStream | null) => {
      stream?.getTracks().forEach((t) => t.stop())
    }

    try {
      // 1. Локальные медиа по выбранным на экране входа тумблерам
      let stream: MediaStream
      if (!wantMic && !wantCam) {
        setIsMuted(true)
        setIsCamOff(true)
        stream = new MediaStream()
      } else {
        setIsMuted(!wantMic)
        setIsCamOff(!wantCam)
        const camPref = readPreferredCameraId()
        const micPref = readPreferredMicId()
        const videoPart = wantCam
          ? {
              ...(camPref ? { deviceId: { exact: camPref } as const } : {}),
              width: { ideal: p.width },
              height: { ideal: p.height },
              frameRate: { ideal: p.frameRate },
            }
          : false
        const audioPart = wantMic
          ? micPref
            ? { deviceId: { exact: micPref } as const }
            : true
          : false
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioPart,
            video: videoPart,
          })
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: wantMic,
            video: wantCam
              ? {
                  width: { ideal: p.width },
                  height: { ideal: p.height },
                  frameRate: { ideal: p.frameRate },
                }
              : false,
          })
        }
      }
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

      socket.on('peerJoined', (raw: unknown) => {
        const row = parsePeerRosterRow(raw)
        const sid = socket.id
        if (!row || !sid) return
        setParticipants((prev) => {
          const next = new Map(prev)
          applyRosterRow(next, row, sid)
          return next
        })
      })

      // 3. Join room
      const joinData = await new Promise<{
        rtpCapabilities: object
        existingProducers?: ProducerDescriptor[]
        chatHistory?: RoomChatMessage[]
        peers?: unknown[]
      }>((res) => {
        socket.emit('joinRoom', {
          roomId,
          name: displayNameRef.current,
          avatarUrl: media?.avatarUrl ?? null,
          authUserId: media?.authUserId ?? null,
        }, res)
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

      const joinSelfId = socket.id
      if (joinSelfId && Array.isArray(joinData.peers)) {
        setParticipants((prev) => {
          const next = new Map(prev)
          for (const raw of joinData.peers!) {
            const row = parsePeerRosterRow(raw)
            if (row) applyRosterRow(next, row, joinSelfId)
          }
          return next
        })
      }

      if (import.meta.env.DEV) console.log('[join] existingProducers:', joinData.existingProducers)

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
      await device.load({ routerRtpCapabilities: joinData.rtpCapabilities as RtpCapabilities })
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

      const sendTransport = device.createSendTransport(sendData as TransportOptions)
      sendTransportRef.current = sendTransport

      const bindConnect = (t: Transport) => {
        t.on('connect', ({ dtlsParameters }, callback, errback) => {
          socket.emit('connectTransport', {
            roomId,
            transportId: t.id,
            dtlsParameters,
          }, (res: { error?: string }) => {
            if (res?.error) return errback(new Error(res.error))
            callback()
          })
        })
      }

      bindConnect(sendTransport)

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        socket.emit('produce', {
          roomId,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData: appData ?? {},
        }, (res: { id?: string; error?: string; screenPeerId?: string }) => {
          if (res?.error) return errback(new Error(res.error))
          const src = (appData as { source?: string } | undefined)?.source
          if (kind === 'video' && src === 'screen') {
            const raw = res as Record<string, unknown>
            const sid =
              (typeof res?.screenPeerId === 'string' && res.screenPeerId.trim()) ||
              (typeof raw.screen_peer_id === 'string' && String(raw.screen_peer_id).trim()) ||
              ''
            if (sid) setLocalScreenPeerId(sid)
          }
          callback({ id: res.id! })
        })
      })

      // 6. Produce tracks (без треков — только приём чужих потоков)
      for (const track of stream.getTracks()) {
        if (track.kind === 'video') {
          videoProducerRef.current = await produceVideoFromTrack(sendTransport, track, p)
        } else {
          const producer = await sendTransport.produce({ track })
          audioProducerRef.current = producer
        }
      }

      // 7. Recv transport
      const recvData = await new Promise<Record<string, unknown>>((res) => {
        socket.emit('createWebRtcTransport', { roomId }, res)
      })

      const recvTransport = device.createRecvTransport(recvData as TransportOptions)
      recvTransportRef.current = recvTransport

      bindConnect(recvTransport)

      // 8. Consume existing producers
      for (const p of joinData.existingProducers ?? []) {
        await consumeProducer(p)
      }

      // 9. Socket events
      if (import.meta.env.DEV) {
        socket.onAny((event: string, ...args: unknown[]) => {
          if (['newProducer', 'producerClosed', 'peerLeft'].includes(event)) {
            console.log(`[socket.onAny] ${event}`, JSON.stringify(args))
          }
        })
      }

      socket.on('newProducer', async (producer: ProducerDescriptor) => {
        if (import.meta.env.DEV) console.log('[newProducer]', producer)
        await consumeProducer(producer)
      })

      socket.on('producerClosed', (payload: unknown) => {
        if (import.meta.env.DEV) console.log('[producerClosed] raw payload:', JSON.stringify(payload))
        const id = producerIdFromClosedPayload(payload)
        if (id && studioProgramVideoProducerRef.current?.id === id) {
          studioProgramVideoProducerRef.current = null
          setStudioBroadcastHealth('warning')
          return
        }
        if (id && studioProgramAudioProducerRef.current?.id === id) {
          studioProgramAudioProducerRef.current = null
          setStudioBroadcastHealth('warning')
          return
        }
        if (id) dropProducerById(id)
        else if (import.meta.env.DEV) console.warn('[producerClosed] could not extract id from payload')
      })

      socket.on('peerLeft', (raw: unknown) => {
        if (import.meta.env.DEV) console.log('[peerLeft] raw payload:', JSON.stringify(raw))
        const peerId = peerIdFromLeftPayload(raw)
        if (!peerId) return

        const toClose = [...producerMetaRef.current.keys()].filter((prodId) => {
          const m = producerMetaRef.current.get(prodId)
          return m && (m.producerPeerId === peerId || m.anchorPeerId === peerId)
        })
        for (const prodId of toClose) dropProducerById(prodId)

        setParticipants((prev) => {
          if (!prev.has(peerId)) return prev
          const next = new Map(prev)
          next.delete(peerId)
          return next
        })
        delete peerUplinkVideoQualityRef.current[peerId]
        setPeerUplinkBroadcastTick((t) => t + 1)
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
        const nr = activityNotifyRef?.current
        const sid = socket.id
        if (
          nr?.flashChatPreview &&
          sid &&
          msg.peerId !== sid &&
          msg.kind !== 'reaction' &&
          nr.isChatClosed()
        ) {
          nr.flashChatPreview(msg.name, msg.text)
        }
        setChatMessages((prev) => mergeIncomingChatMessage(prev, msg))
      }

      socket.on('chat:message', (raw: unknown) => {
        const m = raw as Partial<RoomChatMessage>
        if (!m?.peerId || typeof m.name !== 'string' || typeof m.text !== 'string' || typeof m.ts !== 'number') return
        appendChat(m as RoomChatMessage)
      })

      /**
       * Хост/админ запросил выключить микрофон этому клиенту.
       * Без обработчика на сигналинге событие не придёт — см. `requestPeerMicMute`.
       */
      socket.on('forceMicMute', () => {
        const producer = audioProducerRef.current
        const stream = localStreamRef.current
        const track = stream?.getAudioTracks()[0]
        if (producer) {
          try {
            producer.pause()
          } catch {
            /* mediasoup client */
          }
        }
        if (track) track.enabled = false
        setIsMuted(true)
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

      /**
       * Uplink видео участника → SFU (broadcast с signaling после `reportVideoUplink`).
       * Свой же пакет не применяем — локальная метрика считается через getStats.
       */
      socket.on('videoUplink', (raw: unknown) => {
        const sid = socket.id
        if (!sid) return
        const o = raw as Record<string, unknown>
        if (typeof o.roomId === 'string' && o.roomId !== roomIdRef.current) return
        const peerId = typeof o.peerId === 'string' ? o.peerId.trim() : ''
        if (!peerId || peerId === sid) return
        const q = parseVideoUplinkBroadcast(raw)
        if (!q) return
        peerUplinkVideoQualityRef.current = { ...peerUplinkVideoQualityRef.current, [peerId]: q }
        setPeerUplinkBroadcastTick((t) => t + 1)
      })

      socket.on('studioBroadcastHealth', (raw: unknown) => {
        const o = raw as Record<string, unknown>
        if (typeof o.roomId === 'string' && o.roomId !== roomIdRef.current) return
        if (studioProgramVideoProducerRef.current == null) return
        const st = String(o.state ?? o.status ?? '').toLowerCase()
        if (o.ok === true || st === 'live') setStudioBroadcastHealth('live')
        else if (o.ok === false || st === 'warning' || st === 'error' || st === 'stalled') {
          setStudioBroadcastHealth('warning')
        }
      })

      setStatus('connected')
    } catch (err) {
      if (gen !== joinGenerationRef.current) {
        return
      }
      console.error('[join] error:', err)
      setError(formatMediaJoinError(err))
      setStatus('error')
      setSessionMeta(null)
      setSrtByPeer({})
      setChatMessages([])
      setReactionBursts([])
      setRemoteScreenConsumePending(false)
      studioProgramVideoProducerRef.current?.close()
      studioProgramVideoProducerRef.current = null
      studioProgramAudioProducerRef.current?.close()
      studioProgramAudioProducerRef.current = null
      setStudioBroadcastHealth('idle')
      peerUplinkVideoQualityRef.current = {}
      setPeerUplinkBroadcastTick(0)
      uplinkLocalPrevRef.current = undefined
      uplinkLocalEmaRef.current.clear()
      lastVideoUplinkEmitAtRef.current = 0
      const s = socketRef.current
      socketRef.current = null
      if (s) disposeSignalingSocket(s)
    }
  }, [consumeProducer, dropProducerById])

  const mergeTrackIntoLocalStream = (track: MediaStreamTrack) => {
    const prev = localStreamRef.current
    const kind = track.kind
    let next: MediaStream
    if (!prev) {
      next = new MediaStream([track])
    } else {
      const existing = kind === 'audio' ? prev.getAudioTracks() : prev.getVideoTracks()
      existing.forEach((t) => { t.stop(); prev.removeTrack(t) })
      prev.addTrack(track)
      next = new MediaStream(prev.getTracks())
    }
    localStreamRef.current = next
    setLocalStream(next)
  }

  const ensureAudioProducer = useCallback(async () => {
    const sendTransport = sendTransportRef.current
    if (!sendTransport || audioProducerRef.current) return
    const a = await navigator.mediaDevices.getUserMedia({ audio: true })
    const track = a.getAudioTracks()[0]
    if (!track) { a.getTracks().forEach((t) => t.stop()); return }
    mergeTrackIntoLocalStream(track)
    audioProducerRef.current = await sendTransport.produce({ track })
  }, [])

  const ensureVideoProducer = useCallback(async () => {
    const sendTransport = sendTransportRef.current
    if (!sendTransport || videoProducerRef.current) return
    const preset = presetRef.current
    const v = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: preset.width },
        height: { ideal: preset.height },
        frameRate: { ideal: preset.frameRate },
      },
    })
    const track = v.getVideoTracks()[0]
    if (!track) { v.getTracks().forEach((t) => t.stop()); return }
    mergeTrackIntoLocalStream(track)
    videoProducerRef.current = await produceVideoFromTrack(sendTransport, track, preset)
    uplinkLocalPrevRef.current = undefined
    uplinkLocalEmaRef.current.delete('__local__')
    lastVideoUplinkEmitAtRef.current = 0
  }, [])

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

  /**
   * Попросить сигналинг выключить микрофон участника.
   * Клиент шлёт: `socket.emit('hostRequestPeerMicMute', { roomId, targetPeerId })`,
   * где `targetPeerId` — тот же id, что у участника в ростере (= обычно `socket.id` цели).
   *
   * На сервере Socket.IO (отдельный репозиторий) нужно:
   * 1) слушать `hostRequestPeerMicMute`;
   * 2) проверить, что отправитель — хост комнаты / админ (ваша модель прав);
   * 3) найти сокет цели по `targetPeerId` и вызвать у него `emit('forceMicMute')` (или `socket.to(id).emit` — как у вас принято).
   * Без шага 3 клиент цели не получит событие и звук не прервётся.
   */
  const requestPeerMicMute = useCallback((targetPeerId: string) => {
    const sock = socketRef.current
    const rid = roomIdRef.current?.trim()
    const tid = targetPeerId.trim()
    if (!sock?.connected || !rid || !tid) return
    sock.emit('hostRequestPeerMicMute', { roomId: rid, targetPeerId: tid })
  }, [])

  const toggleMute = useCallback(async () => {
    if (isMuted) {
      try {
        await ensureAudioProducer()
      } catch {
        return
      }
      const producer = audioProducerRef.current
      const stream = localStreamRef.current
      const track = stream?.getAudioTracks()[0]
      if (producer && track) {
        producer.resume()
        track.enabled = true
        setIsMuted(false)
      }
    } else {
      const producer = audioProducerRef.current
      const stream = localStreamRef.current
      const track = stream?.getAudioTracks()[0]
      if (producer && track) {
        producer.pause()
        track.enabled = false
      }
      setIsMuted(true)
    }
  }, [isMuted, ensureAudioProducer])

  const toggleCam = useCallback(async () => {
    if (isCamOff) {
      try {
        await ensureVideoProducer()
      } catch {
        return
      }
      const producer = videoProducerRef.current
      const stream = localStreamRef.current
      const track = stream?.getVideoTracks()[0]
      if (producer && track) {
        producer.resume()
        track.enabled = true
        setIsCamOff(false)
      }
    } else {
      const sock = socketRef.current
      const producer = videoProducerRef.current
      const stream = localStreamRef.current
      if (producer && sock?.connected) {
        const pid = producer.id
        sock.emit('closeProducer', { roomId: roomIdRef.current, producerId: pid })
        producer.close()
        videoProducerRef.current = null
      } else {
        producer?.close()
        videoProducerRef.current = null
      }
      if (stream) {
        for (const t of [...stream.getVideoTracks()]) {
          t.stop()
          stream.removeTrack(t)
        }
        const next = new MediaStream([...stream.getTracks()])
        localStreamRef.current = next
        setLocalStream(next)
      }
      setIsCamOff(true)
    }
  }, [isCamOff, ensureVideoProducer])

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
    uplinkLocalPrevRef.current = undefined
    uplinkLocalEmaRef.current.delete('__local__')
    lastVideoUplinkEmitAtRef.current = 0
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
    persistVideoPreset(preset)

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
    uplinkLocalPrevRef.current = undefined
    uplinkLocalEmaRef.current.delete('__local__')
    lastVideoUplinkEmitAtRef.current = 0

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
    const socket = socketRef.current
    const sid = socket?.id
    const producer = screenProducerRef.current
    if (producer && socket) {
      const pid = producer.id
      socket.emit('closeProducer', { roomId: roomIdRef.current, producerId: pid })
      if (import.meta.env.DEV) console.log('[stopScreenShare] emit closeProducer', pid, 'room', roomIdRef.current)
    }
    producer?.close()
    screenProducerRef.current = null
    localScreenStreamRef.current?.getTracks().forEach((t) => t.stop())
    localScreenStreamRef.current = null
    setLocalScreenStream(null)
    setLocalScreenPeerId(null)
    setIsScreenSharing(false)
    if (sid) stripScreenChatForPeer(sid)
  }, [stripScreenChatForPeer])

  /** Подсказка диалогу getDisplayMedia: весь экран / окно / вкладка (где поддерживается). */
  const startScreenShare = useCallback(
    async (surface?: 'monitor' | 'window' | 'browser') => {
      if (screenProducerRef.current) return
      const sendTransport = sendTransportRef.current
      if (!sendTransport) return
      if (remoteScreenConsumePendingRef.current) return
      for (const p of participantsRef.current.values()) {
        if (p.screenStream) return
      }
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
        const ownerPeerId = socketRef.current?.id
        const producer = await sendTransport.produce({
          track,
          appData: {
            source: 'screen',
            ...(ownerPeerId ? { ownerPeerId } : {}),
          },
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

  const [vmixIngressLoading, setVmixIngressLoading] = useState(false)

  const startVmixIngress = useCallback(async (opts?: {
    latencyMs?: number
    /** Целевой битрейт libx264 (кбит/с); приоритетнее maxBitrateKbps на бэке. */
    videoBitrateKbps?: number
    /** Запасной вариант битрейта на бэке, если не передан videoBitrateKbps. */
    maxBitrateKbps?: number
    /** Запрос фиксированного порта SRT Listener; бэк может игнорировать. */
    listenPort?: number
    passphrase?: string
    streamId?: string
    pbkeylen?: 16 | 32
  }): Promise<{ ok: true; info: VmixIngressInfo } | { ok: false; error: string }> => {
    const socket = socketRef.current
    if (!socket?.connected) return { ok: false, error: 'Нет соединения с сервером' }
    setVmixIngressLoading(true)
    try {
      return await new Promise<{ ok: true; info: VmixIngressInfo } | { ok: false; error: string }>((resolve) => {
        const payload = { roomId: roomIdRef.current, ...readVmixIngressEmitExtras(), ...opts }
        socket.timeout(15_000).emit(
          'startVmixIngress',
          payload,
          (err: Error | null, res?: Record<string, unknown>) => {
            if (err) {
              resolve({
                ok: false,
                error:
                  'Нет ответа от сервера (таймаут или обрыв). Проверьте, что signaling обрабатывает startVmixIngress и вызывает ack.',
              })
              return
            }
            const data = res ?? {}
            if (data.error) {
              resolve({ ok: false, error: String(data.error) })
              return
            }
            const vbRaw = data.videoBitrateKbps
            let videoBitrateKbps: number | null | undefined
            if ('videoBitrateKbps' in data) {
              if (vbRaw === null) videoBitrateKbps = null
              else {
                const n = Number(vbRaw)
                videoBitrateKbps = Number.isFinite(n) ? n : undefined
              }
            }
            const info: VmixIngressInfo = {
              publicHost: String(data.publicHost ?? ''),
              listenPort: Number(data.listenPort ?? 0),
              latencyMs: Number(data.latencyMs ?? 0),
              ...(videoBitrateKbps !== undefined ? { videoBitrateKbps } : {}),
              ...(data.passphrase ? { passphrase: String(data.passphrase) } : {}),
              ...(data.streamId ? { streamId: String(data.streamId) } : {}),
              ...(data.pbkeylen ? { pbkeylen: Number(data.pbkeylen) } : {}),
            }
            setVmixIngressInfo(info)
            resolve({ ok: true, info })
          },
        )
      })
    } finally {
      setVmixIngressLoading(false)
    }
  }, [])

  const stopVmixIngress = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const socket = socketRef.current
    if (!socket?.connected) return { ok: false, error: 'Нет соединения с сервером' }
    setVmixIngressLoading(true)
    try {
      return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        socket.timeout(15_000).emit(
          'stopVmixIngress',
          { roomId: roomIdRef.current },
          (err: Error | null, res?: Record<string, unknown>) => {
            if (err) {
              resolve({
                ok: false,
                error:
                  'Нет ответа от сервера (таймаут или обрыв). Проверьте обработчик stopVmixIngress на signaling.',
              })
              return
            }
            const data = res ?? {}
            if (data.error) {
              resolve({ ok: false, error: String(data.error) })
              return
            }
            setVmixIngressInfo(null)
            resolve({ ok: true })
          },
        )
      })
    } finally {
      setVmixIngressLoading(false)
    }
  }, [])

  const getPeerUplinkVideoQuality = useCallback(
    async (anchorPeerId: string): Promise<InboundVideoQuality | null> => {
      const localId = sessionMeta?.localPeerId
      if (!localId || anchorPeerId !== localId) {
        return peerUplinkVideoQualityRef.current[anchorPeerId] ?? null
      }

      const producer = videoProducerRef.current
      if (!producer || producer.closed || producer.kind !== 'video') return null
      const src = (producer.appData as { source?: string } | undefined)?.source
      if (src === 'screen') return null

      let report: RTCStatsReport
      try {
        report = await producer.getStats()
      } catch {
        return null
      }
      const pair = pickUplinkVideoPair(report)
      if (!pair) return null

      const now = performance.now()
      const sample = sampleFromUplinkPair(pair.outbound, pair.remoteInbound, now)
      const prev = uplinkLocalPrevRef.current
      const delta = deltaUplinkFromSamples(pair.outbound, pair.remoteInbound, prev, now)
      uplinkLocalPrevRef.current = sample
      if (!delta) return null

      const ema = applyEma('__local__', uplinkLocalEmaRef.current, delta.bitrateBps, delta.fractionLost)
      const q = buildQuality(ema.bitrateBps, ema.fractionLost, delta.jitterMs)

      const sock = socketRef.current
      const rid = roomIdRef.current?.trim()
      if (sock?.connected && rid) {
        const t = Date.now()
        if (t - lastVideoUplinkEmitAtRef.current >= 2000) {
          lastVideoUplinkEmitAtRef.current = t
          sock.emit('reportVideoUplink', {
            roomId: rid,
            level: q.level,
            bitrateBps: q.bitrateBps,
            fractionLost: q.fractionLost,
            jitterMs: q.jitterMs,
          })
        }
      }

      return q
    },
    [sessionMeta?.localPeerId, peerUplinkBroadcastTick],
  )

  const stopStudioProgram = useCallback(() => {
    const socket = socketRef.current
    const roomId = roomIdRef.current
    const audioP = studioProgramAudioProducerRef.current
    const videoP = studioProgramVideoProducerRef.current
    if (audioP && socket?.connected) {
      socket.emit('closeProducer', { roomId, producerId: audioP.id })
    }
    if (videoP && socket?.connected) {
      socket.emit('closeProducer', { roomId, producerId: videoP.id })
    }
    audioP?.close()
    videoP?.close()
    studioProgramAudioProducerRef.current = null
    studioProgramVideoProducerRef.current = null
    setStudioBroadcastHealth('idle')
  }, [])

  const replaceStudioProgramAudioTrack = useCallback(async (track: MediaStreamTrack | null) => {
    const producer = studioProgramAudioProducerRef.current
    if (!producer) return
    try {
      await producer.replaceTrack({ track })
      if (track) {
        producer.resume()
      } else {
        producer.pause()
      }
    } catch {
      /* mediasoup-client */
    }
  }, [])

  const startStudioProgram = useCallback(
    async (
      videoTrack: MediaStreamTrack,
      audioTrack: MediaStreamTrack | null,
      rtmpUrl: string,
      streamKey: string,
      output: StudioOutputPreset,
    ): Promise<{ ok: boolean; error?: string }> => {
      const sendTransport = sendTransportRef.current
      if (!sendTransport) {
        setStudioBroadcastHealth('warning')
        return { ok: false, error: 'Нет WebRTC-транспорта' }
      }
      const url = rtmpUrl.trim()
      const key = streamKey.trim()
      if (!url || !key) {
        setStudioBroadcastHealth('warning')
        return { ok: false, error: 'Укажите URL и ключ RTMP' }
      }
      stopStudioProgram()
      setStudioBroadcastHealth('connecting')
      try {
        const videoProducer = await sendTransport.produce({
          track: videoTrack,
          appData: {
            source: 'studio_program',
            rtmpUrl: url,
            rtmpKey: key,
            outputWidth: output.width,
            outputHeight: output.height,
            maxBitrate: output.maxBitrate,
          },
          encodings: [{ maxBitrate: output.maxBitrate, maxFramerate: output.maxFramerate }],
        })
        studioProgramVideoProducerRef.current = videoProducer
        videoProducer.on('transportclose', () => {
          studioProgramVideoProducerRef.current = null
          setStudioBroadcastHealth('warning')
        })

        if (audioTrack) {
          try {
            const audioProducer = await sendTransport.produce({
              track: audioTrack,
              appData: {
                source: 'studio_program_audio',
                rtmpUrl: url,
                rtmpKey: key,
              },
            })
            studioProgramAudioProducerRef.current = audioProducer
            audioProducer.on('transportclose', () => {
              studioProgramAudioProducerRef.current = null
              setStudioBroadcastHealth('warning')
            })
          } catch (e) {
            videoProducer.close()
            studioProgramVideoProducerRef.current = null
            setStudioBroadcastHealth('warning')
            return { ok: false, error: formatMediaJoinError(e) }
          }
        } else {
          studioProgramAudioProducerRef.current = null
        }

        setStudioBroadcastHealth('live')
        return { ok: true }
      } catch (e) {
        setStudioBroadcastHealth('warning')
        return { ok: false, error: formatMediaJoinError(e) }
      }
    },
    [stopStudioProgram],
  )

  const leave = useCallback(() => {
    joinGenerationRef.current += 1
    stopScreenShare()
    stopStudioProgram()
    videoProducerRef.current?.close()
    audioProducerRef.current?.close()
    consumersRef.current.forEach((c) => c.close())
    consumersRef.current.clear()
    producerMetaRef.current.clear()
    uplinkLocalPrevRef.current = undefined
    uplinkLocalEmaRef.current.clear()
    lastVideoUplinkEmitAtRef.current = 0
    peerUplinkVideoQualityRef.current = {}
    setPeerUplinkBroadcastTick(0)
    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    const s = socketRef.current
    socketRef.current = null
    if (s) disposeSignalingSocket(s)
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setParticipants(new Map())
    setStatus('idle')
    setIsMuted(false)
    setIsCamOff(false)
    setSessionMeta(null)
    setSrtByPeer({})
    setChatMessages([])
    setReactionBursts([])
    setVmixIngressInfo(null)
  }, [stopScreenShare, stopStudioProgram])

  return {
    join,
    leave,
    toggleMute,
    requestPeerMicMute,
    toggleCam,
    switchCamera,
    switchMic,
    changePreset,
    activePreset,
    status,
    error,
    localStream,
    localScreenStream,
    localScreenPeerId,
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
    remoteScreenConsumePending,
    startVmixIngress,
    stopVmixIngress,
    vmixIngressInfo,
    vmixIngressLoading,
    getPeerUplinkVideoQuality,
    startStudioProgram,
    stopStudioProgram,
    replaceStudioProgramAudioTrack,
    studioBroadcastHealth,
  }
}
