import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { createWorkers } from './mediasoup/worker'
import { Room } from './mediasoup/room'
import { registerSocketHandlers } from './signaling/socketHandlers'
import { config } from './config'

dotenv.config()

async function main() {
  await createWorkers()

  const app = express()
  app.use(cors())
  app.use(express.json())

  // Health check
  app.get('/health', (_req, res) => res.json({ ok: true }))

  // Active rooms info (for debugging / vMix port reference)
  app.get('/rooms', (_req, res) => {
    const data: Record<string, object[]> = {}
    rooms.forEach((room, roomId) => {
      data[roomId] = [...room.peers.values()].map((p) => ({
        peerId: p.id,
        displayName: p.displayName,
        srtPort: p.srtPort,
        srtUrl: `srt://${config.announcedIp}:${p.srtPort}`,
        srtActive: p.srtActive,
      }))
    })
    res.json(data)
  })

  const httpServer = createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  })

  const rooms = new Map<string, Room>()

  io.on('connection', (socket) => {
    console.log(`[socket.io] Client connected: ${socket.id}`)
    registerSocketHandlers(socket, io, rooms)
  })

  httpServer.listen(config.listenPort, () => {
    console.log(`\n🎬 vMix Streamer backend running on port ${config.listenPort}`)
    console.log(`   Announced IP : ${config.announcedIp}`)
    console.log(`   SRT ports    : ${config.srtBasePort} – ${config.srtBasePort + config.maxPeers - 1}`)
    console.log(`   Rooms info   : http://localhost:${config.listenPort}/rooms\n`)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
