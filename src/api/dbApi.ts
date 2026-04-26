import { fetchJson, type ApiResult } from './http'

export async function dbRpc<T = unknown, A extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  args?: A,
): Promise<ApiResult<T>> {
  return await fetchJson(`/api/db/rpc/${encodeURIComponent(name)}`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ args: args ?? {} }),
  })
}

export async function dbTableSelect<T = unknown>(params: {
  table: string
  select?: string
  filters?: Record<string, unknown>
  limit?: number
  order?: { column: string; ascending?: boolean }[]
}): Promise<ApiResult<{ rows: T[] }>> {
  return await fetchJson(`/api/db/select`, { method: 'POST', auth: true, body: JSON.stringify(params) })
}

export async function dbTableSelectOne<T = unknown>(params: {
  table: string
  select?: string
  filters?: Record<string, unknown>
}): Promise<ApiResult<{ row: T | null }>> {
  return await fetchJson(`/api/db/select-one`, { method: 'POST', auth: true, body: JSON.stringify(params) })
}

export async function dbTableInsert(params: {
  table: string
  row: Record<string, unknown>
}): Promise<ApiResult<{ ok: true }>> {
  return await fetchJson(`/api/db/insert`, { method: 'POST', auth: true, body: JSON.stringify(params) })
}

export async function dbTableUpdate(params: {
  table: string
  patch: Record<string, unknown>
  filters: Record<string, unknown>
}): Promise<ApiResult<{ ok: true }>> {
  return await fetchJson(`/api/db/update`, { method: 'PATCH', auth: true, body: JSON.stringify(params) })
}

export async function dbTableDelete(params: {
  table: string
  filters: Record<string, unknown>
}): Promise<ApiResult<{ ok: true }>> {
  return await fetchJson(`/api/db/delete`, { method: 'DELETE', auth: true, body: JSON.stringify(params) })
}

