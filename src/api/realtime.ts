import { apiBase } from './http'
import { RealtimeClient } from './realtimeClient'
import { getAccessToken } from './http'

function wsUrl(): string {
  const base = apiBase()
  const u = new URL(base || window.location.origin)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = '/ws'
  const token = getAccessToken()
  u.search = token ? `?access_token=${encodeURIComponent(token)}` : ''
  u.hash = ''
  return u.toString()
}

export const realtime = new RealtimeClient(wsUrl())

