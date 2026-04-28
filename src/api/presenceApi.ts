import { fetchJson } from './http'

export async function v1PresenceForegroundPulse(): Promise<{ error: string | null }> {
  const r = await fetchJson<{ ok: true }>('/api/v1/me/presence/foreground-pulse', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

export async function v1PresenceMarkBackground(): Promise<{ error: string | null }> {
  const r = await fetchJson<{ ok: true }>('/api/v1/me/presence/mark-background', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({}),
  })
  return r.ok ? { error: null } : { error: r.error.message }
}

