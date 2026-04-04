import { useCallback, useEffect, useRef, useState } from 'react'
import { Device } from 'mediasoup-client'
import type { Transport, Producer, Consumer } from 'mediasoup-client/lib/types'
import { io, Socket } from 'socket.io-client'
import type { RemotePeer, PeerInfo, TransportResult, ProduceResult, ConsumeResult } from '../types'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? ''
const ROOM_ID = 'default'

// ─── Simulcast encodings ──────────────────────────────────────────────────────
const VIDEO_ENCODINGS = [
  { rid: 'r0', maxBitrate: 150_000, scaleResolutionDownBy: 4 },
  { rid: 'r1', maxBitrate: 900_000, scaleResolutionDownBy: 2 },
  { rid: 'r2', maxBitrate: 6_000_000, scaleResolutionDownBy: 1 },
]

const VIDEO_CODEC_OPTIONS = { videoGoogleStartBitrate: 1000 }

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMediasoup(displayName: string | null) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map())
  const [mySrtPort, setMySrtPort] = useState<number | null>(null)
  const [isAudioMuted, setIsAudioMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const deviceRef = useRef<Device | null>(null)
  const sendTransportRef = useRef<Transport | null>(null)
  const recvTransportRef = useRef<Transport | null>(null)
  const videoProducerRef = useRef<Producer | null>(null)
  const audioProducerRef = useRef<Producer | null>(null)
  const consumersRef = useRef<Map<string, Consumer>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function emit<T = object>(event: string, data: object = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      socketRef.current!.emit(event, data, (res: T & { ok: boolean; error?: string }) => {
        if (res.ok === false) reject(new Error(res.error ?? 'Unknown error'))
        else resolve(res)
      })
    })
  }

  // ─── Consume a remote producer ─────────────────────────────────────────────

  const consumeProducer = useCallback(
    async (peerId: string, producerId: string, kind: 'audio' | 'video') => {
      const device = deviceRef.current
      const recvTransport = recvTransportRef.current
      if (!device || !recvTransport) return

      const res = await emit<ConsumeResult>('consume', {
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      })
      if (!res.id) return

      const consumer = await recvTransport.consume({
        id: res.id,
        producerId: res.producerId!,
        kind: res.kind!,
        rtpParameters: res.rtpParameters as never,
      })

      consumersRef.current.set(consumer.id, consumer)
      await emit('resumeConsumer', { consumerId: consumer.id })

      const stream = new MediaStream([consumer.track])

      setRemotePeers((prev) => {
        const next = new Map(prev)
        const peer = next.get(peerId) ?? {
          peerId,
          displayName: '',
          srtPort: 0,
          videoStream: null,
          audioStream: null,
        }
        if (kind === 'video') {
          next.set(peerId, { ...peer, videoStream: stream, videoConsumerId: consumer.id })
        } else {
          next.set(peerId, { ...peer, audioStream: stream, audioConsumerId: consumer.id })
        }
        return next
      })

      consumer.on('transportclose', () => consumersRef.current.delete(consumer.id))
      consumer.on('producerclose', () => {
        consumersRef.current.delete(consumer.id)
        setRemotePeers((prev) => {
          const next = new Map(prev)
          const peer = next.get(peerId)
          if (!peer) return prev
          if (kind === 'video') next.set(peerId, { ...peer, videoStream: null })
          else next.set(peerId, { ...peer, audioStream: null })
          return next
        })
      })
    },
    []
  )

  // ─── Join ──────────────────────────────────────────────────────────────────

  const join = useCallback(async () => {
    if (!displayName) return
    setStatus('connecting')
    setErrorMsg(null)

    try {
      // 1. Get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      localStreamRef.current = stream
      setLocalStream(stream)

      // 2. Connect socket
      const socket = io(BACKEND_URL, { transports: ['websocket'] })
      socketRef.current = socket

      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve)
        socket.once('connect_error', reject)
      })

      // 3. Join room
      const joinRes = await emit<{
        ok: boolean
        peerId: string
        srtPort: number
        routerRtpCapabilities: object
        peers: PeerInfo[]
      }>('joinRoom', { roomId: ROOM_ID, displayName })

      setMySrtPort(joinRes.srtPort)

      // 4. Load mediasoup device
      const device = new Device()
      await device.load({ routerRtpCapabilities: joinRes.routerRtpCapabilities as never })
      deviceRef.current = device

      // 5. Create send transport
      const sendTRes = await emit<TransportResult>('createTransport', { producing: true })
      const sendTransport = device.createSendTransport({
        id: sendTRes.id!,
        iceParameters: sendTRes.iceParameters as never,
        iceCandidates: sendTRes.iceCandidates as never,
        dtlsParameters: sendTRes.dtlsParameters as never,
      })
      sendTransportRef.current = sendTransport

      sendTransport.on('connect', async ({ dtlsParameters }, cb, errback) => {
        try {
          await emit('connectTransport', { transportId: sendTransport.id, dtlsParameters })
          cb()
        } catch (e) {
          errback(e as Error)
        }
      })

      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, cb, errback) => {
        try {
          const res = await emit<ProduceResult>('produce', {
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData,
          })
          cb({ id: res.id! })
        } catch (e) {
          errback(e as Error)
        }
      })

      // 6. Create recv transport
      const recvTRes = await emit<TransportResult>('createTransport', { producing: false })
      const recvTransport = device.createRecvTransport({
        id: recvTRes.id!,
        iceParameters: recvTRes.iceParameters as never,
        iceCandidates: recvTRes.iceCandidates as never,
        dtlsParameters: recvTRes.dtlsParameters as never,
      })
      recvTransportRef.current = recvTransport

      recvTransport.on('connect', async ({ dtlsParameters }, cb, errback) => {
        try {
          await emit('connectTransport', { transportId: recvTransport.id, dtlsParameters })
          cb()
        } catch (e) {
          errback(e as Error)
        }
      })

      // 7. Produce video + audio
      const videoTrack = stream.getVideoTracks()[0]!
      const audioTrack = stream.getAudioTracks()[0]!

      const videoProducer = await sendTransport.produce({
        track: videoTrack,
        encodings: VIDEO_ENCODINGS,
        codecOptions: VIDEO_CODEC_OPTIONS,
      })
      videoProducerRef.current = videoProducer

      const audioProducer = await sendTransport.produce({ track: audioTrack })
      audioProducerRef.current = audioProducer

      // 8. Consume existing peers
      for (const peer of joinRes.peers) {
        setRemotePeers((prev) => {
          const next = new Map(prev)
          if (!next.has(peer.peerId)) {
            next.set(peer.peerId, {
              peerId: peer.peerId,
              displayName: peer.displayName,
              srtPort: peer.srtPort,
              videoStream: null,
              audioStream: null,
            })
          }
          return next
        })

        for (const producer of peer.producers) {
          await consumeProducer(peer.peerId, producer.id, producer.kind)
        }
      }

      // 9. Register socket events
      socket.on(
        'peerJoined',
        ({ peerId, displayName: name, srtPort }: { peerId: string; displayName: string; srtPort: number }) => {
          setRemotePeers((prev) => {
            const next = new Map(prev)
            next.set(peerId, {
              peerId,
              displayName: name,
              srtPort,
              videoStream: null,
              audioStream: null,
            })
            return next
          })
        }
      )

      socket.on(
        'newProducer',
        async ({
          peerId,
          producerId,
          kind,
        }: {
          peerId: string
          producerId: string
          kind: 'audio' | 'video'
        }) => {
          await consumeProducer(peerId, producerId, kind)
        }
      )

      socket.on('peerLeft', ({ peerId }: { peerId: string }) => {
        setRemotePeers((prev) => {
          const next = new Map(prev)
          next.delete(peerId)
          return next
        })
      })

      setStatus('connected')
    } catch (err) {
      console.error('[useMediasoup] join error:', err)
      setErrorMsg(String(err))
      setStatus('error')
    }
  }, [displayName, consumeProducer])

  // ─── Controls ──────────────────────────────────────────────────────────────

  const toggleAudio = useCallback(() => {
    const producer = audioProducerRef.current
    const stream = localStreamRef.current
    if (!producer || !stream) return
    const track = stream.getAudioTracks()[0]
    if (!track) return
    if (isAudioMuted) {
      producer.resume()
      track.enabled = true
    } else {
      producer.pause()
      track.enabled = false
    }
    setIsAudioMuted((v) => !v)
  }, [isAudioMuted])

  const toggleVideo = useCallback(() => {
    const producer = videoProducerRef.current
    const stream = localStreamRef.current
    if (!producer || !stream) return
    const track = stream.getVideoTracks()[0]
    if (!track) return
    if (isVideoOff) {
      producer.resume()
      track.enabled = true
    } else {
      producer.pause()
      track.enabled = false
    }
    setIsVideoOff((v) => !v)
  }, [isVideoOff])

  const leave = useCallback(() => {
    videoProducerRef.current?.close()
    audioProducerRef.current?.close()
    consumersRef.current.forEach((c) => c.close())
    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    socketRef.current?.disconnect()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    setLocalStream(null)
    setRemotePeers(new Map())
    setStatus('idle')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (status === 'connected') leave()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    join,
    leave,
    toggleAudio,
    toggleVideo,
    localStream,
    remotePeers,
    mySrtPort,
    isAudioMuted,
    isVideoOff,
    status,
    errorMsg,
  }
}
