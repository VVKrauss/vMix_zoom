import { apiFetch } from './client'
import type { BackendGlobalRole } from './authApi'

export type AdminAccessResponse = { staff: boolean; superadmin: boolean }

/** Значение для `PATCH /admin/users/:id/role` — совпадает с пресетами UI админки. */
export type AdminAccessPreset = 'registered' | 'support_admin' | 'platform_admin' | 'superadmin'

/** Элемент списка `GET /admin/users` (camelCase или snake_case с бэкенда). */
export type AdminListedUser = {
  id: string
  email: string | null
  displayName: string | null
  status: string
  createdAt?: string | null
  globalRoles: BackendGlobalRole[]
}

function normalizeGlobalRoles(raw: unknown): BackendGlobalRole[] {
  if (!Array.isArray(raw)) return []
  const out: BackendGlobalRole[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const code = String(o.code ?? '').trim()
    if (!code) continue
    const title = o.title == null ? null : typeof o.title === 'string' ? o.title : String(o.title)
    const scopeType = String(o.scopeType ?? o.scope_type ?? 'global')
    out.push({ code, title, scopeType })
  }
  return out
}

function normalizeListedUser(raw: Record<string, unknown>): AdminListedUser | null {
  const id = String(raw.id ?? '').trim()
  if (!id) return null
  const email = raw.email != null && raw.email !== '' ? String(raw.email) : null
  const displayName =
    raw.displayName != null
      ? String(raw.displayName)
      : raw.display_name != null
        ? String(raw.display_name)
        : null
  const status = raw.status != null ? String(raw.status) : 'active'
  const createdAt =
    raw.createdAt != null
      ? String(raw.createdAt)
      : raw.created_at != null
        ? String(raw.created_at)
        : null
  const globalRoles = normalizeGlobalRoles(raw.globalRoles ?? raw.global_roles)
  return { id, email, displayName, status, createdAt, globalRoles }
}

export async function backendAdminAccess(): Promise<{
  data: AdminAccessResponse | null
  error: string | null
  status: number
}> {
  const res = await apiFetch<AdminAccessResponse>('/admin/access')
  return { data: res.data, error: res.error, status: res.status }
}

export async function backendAdminDbTables(): Promise<{
  tables: string[] | null
  error: string | null
}> {
  const res = await apiFetch<{ tables: string[] }>('/admin/db/tables')
  if (res.error || !res.data) return { tables: null, error: res.error ?? 'tables_failed' }
  return { tables: res.data.tables, error: null }
}

export async function backendAdminDbTablePreview(
  tableName: string,
  limit = 100,
  offset = 0,
): Promise<{
  data: {
    table: string
    limit: number
    offset: number
    rowCount: number
    columns: { name: string; dataTypeID: number }[]
    rows: Record<string, unknown>[]
  } | null
  error: string | null
}> {
  const enc = encodeURIComponent(tableName)
  const res = await apiFetch<{
    table: string
    limit: number
    offset: number
    rowCount: number
    columns: { name: string; dataTypeID: number }[]
    rows: Record<string, unknown>[]
  }>(`/admin/db/table/${enc}?limit=${limit}&offset=${offset}`)
  if (res.error || !res.data) return { data: null, error: res.error ?? 'preview_failed' }
  return { data: res.data, error: null }
}

export async function backendAdminDbRunQuery(
  sql: string,
  readOnly: boolean,
): Promise<{
  data: {
    command: string
    rowCount: number
    columns: { name: string; dataTypeID: number }[]
    rows: Record<string, unknown>[]
  } | null
  error: string | null
}> {
  const res = await apiFetch<{
    command: string
    rowCount: number
    columns: { name: string; dataTypeID: number }[]
    rows: Record<string, unknown>[]
  }>('/admin/db/query', { method: 'POST', body: JSON.stringify({ sql, readOnly }) })
  if (res.error || !res.data) return { data: null, error: res.error ?? 'query_failed' }
  return { data: res.data, error: null }
}

/**
 * Список зарегистрированных пользователей (RBAC).
 * Ответ: `{ items: [...] }` или `{ users: [...] }`; поля пользователя — camelCase или snake_case.
 */
export async function backendAdminListUsers(
  limit = 500,
  offset = 0,
): Promise<{ users: AdminListedUser[]; error: string | null }> {
  const q = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const res = await apiFetch<{ items?: unknown[]; users?: unknown[] }>(`/admin/users?${q}`)
  if (res.error || !res.data) return { users: [], error: res.error ?? 'list_users_failed' }
  const raw = res.data.items ?? res.data.users ?? []
  const users: AdminListedUser[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const u = normalizeListedUser(row as Record<string, unknown>)
    if (u) users.push(u)
  }
  return { users, error: null }
}

/** Одна операция смены глобального пресета (бэкенд сам синхронизирует `user_global_roles`). */
export async function backendAdminSetUserAccessPreset(
  userId: string,
  preset: AdminAccessPreset,
): Promise<string | null> {
  const res = await apiFetch<{ ok?: boolean }>(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ accessPreset: preset }),
  })
  return res.error
}

export async function backendAdminDeleteRegisteredUser(userId: string): Promise<string | null> {
  const res = await apiFetch<{ ok?: boolean }>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
  return res.error
}
