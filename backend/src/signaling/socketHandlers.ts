import type { Socket, Server } from 'socket.io'
import { Room } from '../mediasoup/room'

type RoomMap = Map<string, Room>

// peerId → roomId mapping for cleanup on disconnect
const peerRoomMap = new Map<string, string>()

export function registerSocketHandlers(
  socket: Socket,
  io: Server,
  rooms: RoomMap
): void {
  let currentPeerId: string | null = null
  let currentRoomId: string | null = null

  // ─── joinRoom ────────────────────────────────────────────────────────────

  socket.on(
    'joinRoom',
    async (
      { roomId, displayName }: { roomId: string; displayName: string },
      callback: (data: object) => void
    ) => {
      try {
        if (!rooms.has(roomId)) {
          rooms.set(roomId, await Room.create(roomId))
        }
        const room = rooms.get(roomId)!

        const peerId = socket.id
        currentPeerId = peerId
        currentRoomId = roomId
        peerRoomMap.set(peerId, roomId)

        const peer = await room.addPeer(peerId, displayName)
        await socket.join(roomId)

        // Inform others about the new participant
        socket.to(roomId).emit('peerJoined', {
          peerId,
          displayName,
          srtPort: peer.srtPort,
        })

        callback({
          ok: true,
          peerId,
          srtPort: peer.srtPort,
          routerRtpCapabilities: room.router.rtpCapabilities,
          peers: room.getOtherPeersInfo(peerId),
        })
      } catch (err) {
        console.error('[socket] joinRoom error:', err)
        callback({ ok: false, error: String(err) })
      }
    }
  )

  // ─── createTransport ─────────────────────────────────────────────────────

  socket.on(
    'createTransport',
    async (
      { producing }: { producing: boolean },
      callback: (data: object) => void
    ) => {
      try {
        const room = getRoom(rooms, currentRoomId)
        const transport = await room.createWebRtcTransport(socket.id, producing)

        callback({
          ok: true,
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        })
      } catch (err) {
        callback({ ok: false, error: String(err) })
      }
    }
  )

  // ─── connectTransport ─────────────────────────────────────────────────────

  socket.on(
    'connectTransport',
    async (
      { transportId, dtlsParameters }: { transportId: string; dtlsParameters: object },
      callback: (data: object) => void
    ) => {
      try {
        const room = getRoom(rooms, currentRoomId)
        await room.connectTransport(socket.id, transportId, dtlsParameters)
        callback({ ok: true })
      } catch (err) {
        callback({ ok: false, error: String(err) })
      }
    }
  )

  // ─── produce ──────────────────────────────────────────────────────────────

  socket.on(
    'produce',
    async (
      {
        transportId,
        kind,
        rtpParameters,
        appData,
      }: {
        transportId: string
        kind: 'audio' | 'video'
        rtpParameters: object
        appData: Record<string, unknown>
      },
      callback: (data: object) => void
    ) => {
      try {
        const room = getRoom(rooms, currentRoomId)
        const producer = await room.produce(
          socket.id,
          transportId,
          kind,
          rtpParameters as never,
          appData
        )

        // Notify other peers so they can consume this producer
        socket.to(currentRoomId!).emit('newProducer', {
          peerId: socket.id,
          producerId: producer.id,
          kind,
        })

        callback({ ok: true, id: producer.id })
      } catch (err) {
        callback({ ok: false, error: String(err) })
      }
    }
  )

  // ─── consume ──────────────────────────────────────────────────────────────

  socket.on(
    'consume',
    async (
      {
        producerId,
        rtpCapabilities,
      }: { producerId: string; rtpCapabilities: object },
      callback: (data: object) => void
    ) => {
      try {
        const room = getRoom(rooms, currentRoomId)
        const consumer = await room.consume(
          socket.id,
          producerId,
          rtpCapabilities as never
        )

        callback({
          ok: true,
          id: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        })
      } catch (err) {
        callback({ ok: false, error: String(err) })
      }
    }
  )

  // ─── resumeConsumer ───────────────────────────────────────────────────────

  socket.on(
    'resumeConsumer',
    async (
      { consumerId }: { consumerId: string },
      callback: (data: object) => void
    ) => {
      try {
        const room = getRoom(rooms, currentRoomId)
        await room.resumeConsumer(socket.id, consumerId)
        callback({ ok: true })
      } catch (err) {
        callback({ ok: false, error: String(err) })
      }
    }
  )

  // ─── disconnect ───────────────────────────────────────────────────────────

  socket.on('disconnect', async () => {
    if (!currentPeerId || !currentRoomId) return
    const room = rooms.get(currentRoomId)
    if (!room) return

    await room.removePeer(currentPeerId)
    peerRoomMap.delete(currentPeerId)

    io.to(currentRoomId).emit('peerLeft', { peerId: currentPeerId })

    if (room.isEmpty()) {
      room.close()
      rooms.delete(currentRoomId)
      console.log(`[Room] Room "${currentRoomId}" deleted (empty)`)
    }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoom(rooms: RoomMap, roomId: string | null): Room {
  if (!roomId) throw new Error('Not in a room')
  const room = rooms.get(roomId)
  if (!room) throw new Error(`Room not found: ${roomId}`)
  return room
}
