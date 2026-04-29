import { fetchJson } from './http'

export type PresenceMirrorWireRow = {
  user_id: string
  last_active_at: string | null
  presence_last_background_at: string | null
  profile_show_online: boolean | null
}

export async function v1ListUserPresencePublicByIds(
  userIds: readonly string[],
): Promise<{ data: PresenceMirrorWireRow[] | null; error: string | null }> {
  const ids = [...new Set(userIds.map((x) => x.trim()).filter(Boolean))].slice(0, 200)
  if (!ids.length) return { data: [], error: null }
  const qs = new URLSearchParams()
  qs.set('ids', ids.join(','))
  const r = await fetchJson<{ rows: PresenceMirrorWireRow[] }>(`/api/v1/presence/public?${qs.toString()}`, {
    method: 'GET',
    auth: true,
  })
  if (!r.ok) return { data: null, error: r.error.message }
  const rows = Array.isArray((r.data as any)?.rows) ? (r.data as any).rows : []
  return { data: rows, error: null }
}

