import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './tokens'
import { getBackendOrigin } from './client'

type ServerToClientEvents = {
  'dm:message:new': (payload: { conversationId: string; message: any }) => void
  'dm:typing:update': (payload: { conversationId: string; userId: string; typing: boolean }) => void
  'dm:read:updated': (payload: { conversationId: string; userId: string; lastReadAt: string }) => void
  'unread:changed': (payload: { total: number; byConversation?: Record<string, number> }) => void
}

type ClientToServerEvents = {
  'room:join': (payload: { room: string }, cb?: (ack: { ok: boolean }) => void) => void
  'room:leave': (payload: { room: string }, cb?: (ack: { ok: boolean }) => void) => void
}

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null

export function getBackendSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (socket) return socket
  const origin = getBackendOrigin()
  socket = io(origin, {
    path: '/socket.io',
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: { token: getAccessToken() },
  })
  return socket
}

export function refreshBackendSocketAuth(): void {
  if (!socket) return
  socket.auth = { token: getAccessToken() }
}

