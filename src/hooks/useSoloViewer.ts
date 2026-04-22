import { useCallback, useEffect, useState } from 'react'
import { Device } from 'mediasoup-client'
import type { Transport, Consumer } from 'mediasoup-client/lib/types'
import { io, Socket } from 'socket.io-client'
import type { ProducerDescriptor } from '../types'
import {
  descriptorAudioSource,
  isVmixProducer,
  ownerPeerFromDescriptor,
  resolveVideoProducerRole,
} from '../utils/producerVideoRole'

import { signalingSocketUrl } from '../utils/signalingBase'

/** Ответ ack на `joinRoomAsViewer` (см. docs/BACKEND_SOLO_VIEWER.md). */
export type JoinRoomAsViewerAck = {
  error?: string
  rtpCapabilities: object
  producers?: ProducerDescriptor[]
}

export type SoloViewerStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'peer_left'

export function useSoloViewer(roomId: string, watchPeerId: string) {
  const [status, setStatus] = useState<SoloViewerStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [camVideo, setCamVideo] = useState<MediaStream | null>(null)
  const [scrVideo, setScrVideo] = useState<MediaStream | null>(null)
  const [micAudioStream, setMicAudioStream] = useState<MediaStream | null>(null)
  const [screenAudioStream, setScreenAudioStream] = useState<MediaStream | null>(null)
  /** Один watchPeerId — один тип видео; при отдельном peerId демонстрации заполняется только один слот. */
  const videoStream = camVideo ?? scrVideo
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    const consumers = new Map<string, Consumer>()
    let recvTransport: Transport | null = null
    let device: Device | null = null
    let socket: Socket | null = null
    const producerMeta = new Map<string,
      | { consumerId: string; kind: 'audio' }
      | { consumerId: string; kind: 'video'; videoRole: 'camera' | 'screen' }
    >()
    let hadCameraVideo = false

    const cleanup = () => {
      consumers.forEach((c) => c.close())
      consumers.clear()
      producerMeta.clear()
      try {
        recvTransport?.close()
      } catch {
        /* noop */
      }
      recvTransport = null
      device = null
      socket?.disconnect()
      socket = null
    }

    const run = async () => {
      setStatus('connecting')
      setError(null)
      setCamVideo(null)
      setScrVideo(null)
      setMicAudioStream(null)
      setScreenAudioStream(null)

      try {
        socket = io(signalingSocketUrl(), { transports: ['polling', 'websocket'] })

        await new Promise<void>((resolve, reject) => {
          socket!.once('connect', resolve)
          socket!.once('connect_error', reject)
        })
        if (cancelled) return

        const ack = await new Promise<JoinRoomAsViewerAck>((res, rej) => {
          const t = window.setTimeout(() => rej(new Error('Таймаут: сервер не ответил на joinRoomAsViewer')), 20_000)
          socket!.emit('joinRoomAsViewer', { roomId, watchPeerId }, (r: JoinRoomAsViewerAck) => {
            window.clearTimeout(t)
            res(r)
          })
        })
        if (cancelled) return

        if (ack?.error) throw new Error(ack.error)
        if (!ack?.rtpCapabilities) throw new Error('joinRoomAsViewer: нет rtpCapabilities')

        device = new Device()
        await device.load({ routerRtpCapabilities: ack.rtpCapabilities as never })
        if (cancelled) return

        const recvData = await new Promise<Record<string, unknown>>((res) => {
          socket!.emit('createWebRtcTransport', { roomId }, res)
        })
        if (cancelled) return
        if ((recvData as { error?: string }).error) {
          throw new Error((recvData as { error: string }).error)
        }

        recvTransport = device.createRecvTransport(recvData as never)

        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          socket!.emit(
            'connectTransport',
            { roomId, transportId: recvTransport!.id, dtlsParameters },
            (res: { error?: string }) => {
              if (res?.error) return errback(new Error(res.error))
              callback()
            },
          )
        })

        const consumeOne = async (producer: ProducerDescriptor) => {
          const owner = ownerPeerFromDescriptor(producer) ?? null
          const matchesWatch = producer.peerId === watchPeerId
          const matchesOwner = owner != null && owner === watchPeerId
          if ((!matchesWatch && !matchesOwner) || cancelled) return

          const isVmixAudio =
            producer.kind === 'audio' &&
            (descriptorAudioSource(producer) === 'vmix' || isVmixProducer(producer))
          // Solo "watch myself" must not accidentally attach SRT program audio as "mic".
          if (isVmixAudio && matchesOwner && !matchesWatch) return

          const data = await new Promise<Record<string, unknown>>((res) => {
            socket!.emit(
              'consume',
              {
                roomId,
                producerId: producer.producerId,
                transportId: recvTransport!.id,
                rtpCapabilities: device!.rtpCapabilities,
              },
              res,
            )
          })
          if (cancelled) return
          if (data?.error) {
            console.error('[soloViewer consume]', data.error)
            return
          }

          const consumer = await recvTransport!.consume(data as never)
          consumers.set(consumer.id, consumer)

          const stream = new MediaStream([consumer.track])
          if (consumer.kind === 'video') {
            if (!matchesWatch) return
            const role = resolveVideoProducerRole(producer, hadCameraVideo)
            if (role === 'camera') hadCameraVideo = true
            producerMeta.set(producer.producerId, {
              consumerId: consumer.id,
              kind: 'video',
              videoRole: role === 'screen' ? 'screen' : 'camera',
            })
            if (role === 'screen') setScrVideo(stream)
            else setCamVideo(stream)
          } else {
            producerMeta.set(producer.producerId, { consumerId: consumer.id, kind: 'audio' })
            const src = descriptorAudioSource(producer) ?? 'mic'
            if (src === 'screen') setScreenAudioStream(stream)
            else if (src === 'vmix') {
              // Not mixed into mic slot; SoloViewerPage currently doesn't play this separately.
              // (If we want SRT audio in solo, wire a dedicated element later.)
            } else setMicAudioStream(stream)
          }

          socket!.emit('resumeConsumer', { roomId, consumerId: consumer.id }, () => {})
        }

        for (const p of ack.producers ?? []) {
          await consumeOne(p)
        }
        if (cancelled) return

        const onNewProducer = async (producer: ProducerDescriptor) => {
          await consumeOne(producer)
        }

        const onProducerClosed = (payload: { producerId?: string }) => {
          const pid = payload?.producerId
          if (!pid) return
          const m = producerMeta.get(pid)
          if (!m) return
          const c = consumers.get(m.consumerId)
          try {
            c?.close()
          } catch {
            /* noop */
          }
          consumers.delete(m.consumerId)
          producerMeta.delete(pid)
          if (m.kind === 'audio') {
            // Консервативно: если закрыли audio producer — очищаем оба слота (будут восстановлены newProducer).
            setMicAudioStream(null)
            setScreenAudioStream(null)
          }
          else if (m.videoRole === 'screen') {
            setScrVideo(null)
            /* Новый MediaStream с теми же треками — иначе videoStream может совпасть по ссылке
               с состоянием до шаринга и React/Chromium не обновят <video> (чёрный экран). */
            setCamVideo((prev) => (prev ? new MediaStream(prev.getTracks()) : prev))
          } else {
            setCamVideo(null)
            hadCameraVideo = false
          }
        }

        const onPeerLeft = ({ peerId }: { peerId: string }) => {
          if (peerId !== watchPeerId) return
          cleanup()
          if (!cancelled) setStatus('peer_left')
        }

        socket.on('newProducer', onNewProducer)
        socket.on('producerClosed', onProducerClosed)
        socket.on('peerLeft', onPeerLeft)

        if (!cancelled) setStatus('connected')
      } catch (e) {
        if (cancelled) return
        console.error('[soloViewer]', e)
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
        cleanup()
      }
    }

    void run()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [roomId, watchPeerId, attempt])

  const retry = useCallback(() => {
    setAttempt((a) => a + 1)
  }, [])

  return {
    status,
    error,
    videoStream,
    camVideo,
    scrVideo,
    micAudioStream,
    screenAudioStream,
    retry,
  }
}
