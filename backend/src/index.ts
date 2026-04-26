import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import { createDb } from './db.js'
import { readEnv } from './env.js'
import { hashPassword, verifyPassword } from './auth/passwords.js'
import { signAccessToken, verifyAccessToken } from './auth/tokens.js'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'node:crypto'
import os from 'node:os'
import { WebSocketServer } from 'ws'
import { URL } from 'node:url'
import { registerApiV1 } from './api/v1/register.js'
import { ensureDbChangeTriggers, startDbChangeListener } from './realtime/dbChangeFeed.js'
import { sendWebPushToUser } from './push/webPush.js'
import { listMyChannels, listMyDirectConversations, listMyGroupChats } from './domain/messengerLists.js'
import {
  getMyConversationNotificationMuteRows,
  listMyContactAliasRows,
  listMyContacts,
} from './domain/meContacts.js'
import { assertUuidList } from './domain/uuidList.js'

const env = readEnv()
const db = createDb()

const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
})

const app = Fastify({ logger: true })

// Always log unexpected errors (otherwise we may only see statusCode=500 without details).
app.setErrorHandler((err: any, req: any, reply: any) => {
  const statusCode = Number(err?.statusCode ?? err?.status ?? 0) || 500
  const url = String(req?.url ?? '')
  const method = String(req?.method ?? '')
  const reqId = String((req as any)?.id ?? (req as any)?.reqId ?? '')
  app.log.error({ err, statusCode, method, url, reqId }, 'request_error')
  const message = statusCode >= 500 ? 'Internal Server Error' : String(err?.message ?? 'request_failed')
  void reply.code(statusCode).send({ message })
})

type PasswordResetCode = { code: string; expiresAtMs: number }
const passwordResetCodes = new Map<string, PasswordResetCode>()

function resolveStorageTarget(logicalBucket: string, objectPath: string): { bucket: string; key: string } {
  const b = logicalBucket.trim()
  const p = objectPath.replace(/^\/+/, '').trim()
  if (!b || !p) throw Object.assign(new Error('bad_storage_path'), { statusCode: 400 })

  // Preferred: separate buckets.
  if (env.S3_BUCKET_AVATARS && env.S3_BUCKET_MESSENGER_MEDIA) {
    if (b === 'avatars') return { bucket: env.S3_BUCKET_AVATARS, key: p }
    if (b === 'messenger-media') return { bucket: env.S3_BUCKET_MESSENGER_MEDIA, key: p }
    throw Object.assign(new Error('bad_bucket'), { statusCode: 400 })
  }

  // Legacy: single bucket with "{bucket}/{path}" prefix.
  if (!env.S3_BUCKET) throw Object.assign(new Error('storage_not_configured'), { statusCode: 500 })
  return { bucket: env.S3_BUCKET, key: `${b}/${p}`.replace(/^\/+/, '') }
}

function sha256Base64Url(input: string): string {
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest('base64url')
  return hash
}

function newOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function readClientIp(req: any): string | null {
  const xf = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
  const ip = xf || String(req.ip ?? '').trim()
  return ip || null
}

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true)
    if (origin === env.PUBLIC_ORIGIN) return cb(null, true)
    // Local dev (Vite)
    if (origin === 'http://localhost:5173') return cb(null, true)
    if (origin === 'http://127.0.0.1:5173') return cb(null, true)
    if (origin === 'http://localhost:4173') return cb(null, true)
    if (origin === 'http://127.0.0.1:4173') return cb(null, true)
    return cb(new Error('CORS'), false)
  },
  credentials: true,
})
await app.register(cookie)
await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } })
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

app.setErrorHandler((err: any, _req: any, reply: any) => {
  // jose (JWT) errors should not become 500s.
  const code = typeof err?.code === 'string' ? err.code : ''
  const name = typeof err?.name === 'string' ? err.name : ''
  if (code === 'ERR_JWT_EXPIRED' || name === 'JWTExpired') {
    return reply.code(401).send({ message: 'Unauthorized', code: 'jwt_expired' })
  }
  if (code.startsWith('ERR_JWT_') || name.startsWith('JWT')) {
    return reply.code(401).send({ message: 'Unauthorized', code: 'jwt_invalid' })
  }
  const status = typeof err?.statusCode === 'number' ? err.statusCode : 500
  const message = typeof err?.message === 'string' && err.message ? err.message : 'Internal Server Error'
  return reply.code(status).send({ message })
})

async function requireAuth(req: any): Promise<{ userId: string }> {
  const h = String(req.headers.authorization ?? '')
  const token = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : ''
  if (!token) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 })
  try {
    const claims = await verifyAccessToken(token)
    return { userId: claims.sub }
  } catch (e: any) {
    const code = typeof e?.code === 'string' ? e.code : ''
    const name = typeof e?.name === 'string' ? e.name : ''
    if (code === 'ERR_JWT_EXPIRED' || name === 'JWTExpired') {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401, code: 'jwt_expired' })
    }
    if (code.startsWith('ERR_JWT_') || name.startsWith('JWT')) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401, code: 'jwt_invalid' })
    }
    throw e
  }
}

function assertUserPresenceSelectAllowed(filters: Record<string, unknown>, viewerId: string): void {
  if (filters.user_id === viewerId) return
  const ids = assertUuidList((filters as any).user_id__in, 200)
  if (!ids.length) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
}

function sanitizeUserSelfPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    'display_name',
    'avatar_url',
    'profile_slug',
    'messenger_pinned_conversation_ids',
    'room_ui_preferences',
    'profile_search_closed',
    'profile_search_allow_by_name',
    'profile_search_allow_by_email',
    'profile_search_allow_by_slug',
    'dm_allow_from',
    'profile_view_allow_from',
    'profile_show_avatar',
    'profile_show_slug',
    'profile_show_last_active',
    'profile_show_online',
    'profile_dm_receipts_private',
    'updated_at',
  ])

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.has(k)) {
      throw Object.assign(new Error('forbidden_patch'), { statusCode: 403 })
    }
    out[k] = v
  }
  if (Object.keys(out).length === 0) {
    throw Object.assign(new Error('empty_patch'), { statusCode: 400 })
  }
  return out
}

async function isStaff(userId: string): Promise<boolean> {
  const r = await db.pool.query<{ code: string }>(
    `select r.code
       from public.user_global_roles ugr
       join public.roles r on r.id = ugr.role_id
      where ugr.user_id = $1 and r.scope_type = 'global'`,
    [userId],
  )
  const codes = new Set(r.rows.map((x) => x.code))
  return codes.has('superadmin') || codes.has('platform_admin') || codes.has('support_admin')
}

async function assertConversationMember(conversationId: string, userId: string): Promise<void> {
  const cid = conversationId.trim()
  if (!cid) throw Object.assign(new Error('bad_conversation_id'), { statusCode: 400 })
  const r = await db.pool.query(
    `select 1 from public.chat_conversation_members where conversation_id = $1 and user_id = $2 limit 1`,
    [cid, userId],
  )
  if (!r.rowCount) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
}

function sanitizeSelect(select: string | undefined): string {
  const raw = (select ?? '*').trim()
  if (!raw) return '*'
  if (raw.length > 500) throw Object.assign(new Error('select_too_long'), { statusCode: 400 })
  const bad = /;|--|\/\*|\*\//.test(raw) || /\b(drop|alter|create|grant|revoke|truncate)\b/i.test(raw)
  if (bad) throw Object.assign(new Error('bad_select'), { statusCode: 400 })
  if (!/^[\w\s,.*()!'"`-]+$/u.test(raw)) throw Object.assign(new Error('bad_select'), { statusCode: 400 })
  return raw
}

function setRefreshCookie(reply: any, refreshToken: string): void {
  reply.setCookie(env.REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/api/auth',
    maxAge: env.REFRESH_TTL_SEC,
  })
}

function clearRefreshCookie(reply: any): void {
  reply.clearCookie(env.REFRESH_COOKIE_NAME, { path: '/api/auth' })
}

async function issueRefreshSession(args: {
  userId: string
  refreshTokenPlain: string
  userAgent: string | null
  ip: string | null
  deviceLabel?: string | null
}): Promise<void> {
  const hash = sha256Base64Url(args.refreshTokenPlain)
  const now = new Date()
  const exp = new Date(Date.now() + env.REFRESH_TTL_SEC * 1000)
  await db.pool.query(
    `insert into public.refresh_sessions
      (user_id, refresh_token_hash, user_agent, ip, device_label, expires_at, created_at, last_used_at)
     values ($1, $2, $3, $4::inet, $5, $6, $7, $7)`,
    [args.userId, hash, args.userAgent, args.ip, args.deviceLabel ?? null, exp.toISOString(), now.toISOString()],
  )
}

async function revokeRefreshSessionByToken(refreshTokenPlain: string): Promise<void> {
  const hash = sha256Base64Url(refreshTokenPlain)
  await db.pool.query(
    `update public.refresh_sessions
       set revoked_at = now()
     where refresh_token_hash = $1 and revoked_at is null`,
    [hash],
  )
}

async function rotateRefreshSession(refreshTokenPlain: string, req: any, reply: any): Promise<{ userId: string; newRefresh: string } | null> {
  const hash = sha256Base64Url(refreshTokenPlain)
  const r = await db.pool.query<{ user_id: string }>(
    `select user_id
       from public.refresh_sessions
      where refresh_token_hash = $1
        and revoked_at is null
        and expires_at > now()
      limit 1`,
    [hash],
  )
  const row = r.rows[0]
  if (!row?.user_id) return null

  // revoke old, create new (rotation)
  await db.pool.query(`update public.refresh_sessions set revoked_at = now(), last_used_at = now() where refresh_token_hash = $1`, [hash])

  const newRefresh = newOpaqueToken()
  await issueRefreshSession({
    userId: row.user_id,
    refreshTokenPlain: newRefresh,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: readClientIp(req),
  })
  setRefreshCookie(reply, newRefresh)
  return { userId: row.user_id, newRefresh }
}

async function requireStaff(req: any): Promise<{ userId: string }> {
  const a = await requireAuth(req)
  const ok = await isStaff(a.userId)
  if (!ok) throw Object.assign(new Error('forbidden'), { statusCode: 403 })
  return a
}

function releaseInfo(): { version: string | null; nodeEnv: string | null } {
  const v = String(process.env.RELEASE_VERSION ?? '').trim()
  const nodeEnv = String(process.env.NODE_ENV ?? '').trim()
  return { version: v || null, nodeEnv: nodeEnv || null }
}

registerApiV1(app, { db, requireAuth })

app.get('/api/health', async () => ({ ok: true }))

// VPS diagnostics (admin only)
app.get('/api/admin/vps', async (req) => {
  await requireStaff(req)

  const now = new Date().toISOString()
  const rel = releaseInfo()

  // DB check
  let dbOk = false
  let dbError: string | null = null
  let dbServerVersion: string | null = null
  let dbNow: string | null = null
  try {
    const r = await db.pool.query<{ version: string }>(`show server_version`)
    dbServerVersion = r.rows[0]?.version ?? null
    const t = await db.pool.query<{ now: string }>(`select now()::timestamptz as now`)
    dbNow = t.rows[0]?.now ?? null
    dbOk = true
  } catch (e: any) {
    dbOk = false
    dbError = typeof e?.message === 'string' ? e.message : 'db_failed'
  }

  // S3 check (lightweight listing)
  const buckets = env.S3_BUCKET_AVATARS && env.S3_BUCKET_MESSENGER_MEDIA
    ? [
        { logical: 'avatars', bucket: env.S3_BUCKET_AVATARS },
        { logical: 'messenger-media', bucket: env.S3_BUCKET_MESSENGER_MEDIA },
      ]
    : env.S3_BUCKET
      ? [{ logical: 'legacy', bucket: env.S3_BUCKET }]
      : []

  const s3Checks: any[] = []
  for (const b of buckets) {
    try {
      const out = await s3.send(new ListObjectsV2Command({ Bucket: b.bucket, MaxKeys: 1 }))
      s3Checks.push({
        logical: b.logical,
        bucket: b.bucket,
        ok: true,
        sampleKey: out.Contents?.[0]?.Key ?? null,
      })
    } catch (e: any) {
      s3Checks.push({
        logical: b.logical,
        bucket: b.bucket,
        ok: false,
        error: typeof e?.message === 'string' ? e.message : 's3_failed',
      })
    }
  }

  // VPS metrics (best-effort)
  const memTotal = os.totalmem()
  const memFree = os.freemem()
  const load = os.loadavg()
  const uptimeSec = os.uptime()

  return {
    ok: true,
    now,
    release: rel,
    db: { ok: dbOk, error: dbError, serverVersion: dbServerVersion, now: dbNow },
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      buckets: s3Checks,
      note: 'Storage providers usually do not expose total/free capacity via S3 API; this endpoint checks connectivity only.',
    },
    vps: {
      memTotalBytes: memTotal,
      memFreeBytes: memFree,
      loadAvg: { '1m': load[0], '5m': load[1], '15m': load[2] },
      uptimeSec,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
    },
  }
})

// Admin DB explorer (tables + preview rows)
app.get('/api/admin/db/tables', async (req) => {
  await requireStaff(req)
  const r = await db.pool.query<{ table_name: string }>(
    `
    select table_name
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
     order by table_name asc
    `,
  )
  return { rows: r.rows.map((x) => x.table_name) }
})

app.get('/api/admin/db/tables/:table', async (req) => {
  await requireStaff(req)
  const table = String((req.params as any)?.table ?? '').trim()
  const Q = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).max(50_000).default(0),
  })
  const q = Q.parse((req as any).query ?? {})

  const allow = await db.pool.query<{ table_name: string }>(
    `
    select table_name
      from information_schema.tables
     where table_schema='public'
       and table_type='BASE TABLE'
       and table_name=$1
     limit 1
    `,
    [table],
  )
  if (!allow.rowCount) throw Object.assign(new Error('unknown_table'), { statusCode: 404 })

  const ident = table.replace(/"/g, '""')
  const cols = await db.pool.query<{ column_name: string; data_type: string }>(
    `
    select column_name, data_type
      from information_schema.columns
     where table_schema='public'
       and table_name=$1
     order by ordinal_position asc
    `,
    [table],
  )
  const rows = await db.pool.query(`select * from public."${ident}" limit $1 offset $2`, [q.limit, q.offset])
  return { table, columns: cols.rows, rows: rows.rows }
})

app.post('/api/auth/signup', async (req, reply) => {
  const Body = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    displayName: z.string().min(1).max(160),
  })
  const body = Body.parse(req.body)
  const pwHash = await hashPassword(body.password)
  const idRes = await db.pool.query<{ id: string }>(
    `insert into public.users (id, email, display_name, password_hash)
     values (gen_random_uuid(), $1, $2, $3)
     returning id`,
    [body.email.toLowerCase(), body.displayName, pwHash],
  )
  const userId = idRes.rows[0]?.id
  if (!userId) throw new Error('signup_failed')

  const accessToken = await signAccessToken({ sub: userId, email: body.email, displayName: body.displayName })
  const refreshToken = newOpaqueToken()
  setRefreshCookie(reply, refreshToken)
  await issueRefreshSession({
    userId,
    refreshTokenPlain: refreshToken,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: readClientIp(req),
  })

  return { session: { accessToken, user: { id: userId, email: body.email, displayName: body.displayName } } }
})

app.post('/api/auth/login', async (req, reply) => {
  const Body = z.object({ email: z.string().email(), password: z.string().min(1) })
  const body = Body.parse(req.body)
  const r = await db.pool.query<{ id: string; password_hash: string | null; display_name: string; email: string | null }>(
    `select id, password_hash, display_name, email from public.users where lower(email) = $1 limit 1`,
    [body.email.toLowerCase()],
  )
  const u = r.rows[0]
  if (!u?.id || !u.password_hash) return reply.code(401).send({ message: 'Неверный логин или пароль' })
  const ok = await verifyPassword(u.password_hash, body.password)
  if (!ok) return reply.code(401).send({ message: 'Неверный логин или пароль' })

  const accessToken = await signAccessToken({ sub: u.id, email: u.email, displayName: u.display_name })
  const refreshToken = newOpaqueToken()
  setRefreshCookie(reply, refreshToken)
  await issueRefreshSession({
    userId: u.id,
    refreshTokenPlain: refreshToken,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: readClientIp(req),
  })
  return { session: { accessToken, user: { id: u.id, email: u.email, displayName: u.display_name } } }
})

app.post('/api/auth/password/reset', async (req, reply) => {
  const Body = z.object({
    email: z.string().email(),
    // kept for compatibility with supabase-like client API
    redirectTo: z.string().min(1).optional(),
  })
  const body = Body.parse(req.body)
  const email = body.email.toLowerCase()

  // Always respond ok to avoid user enumeration.
  const r = await db.pool.query<{ id: string }>(`select id from public.users where lower(email) = $1 limit 1`, [email])
  const exists = Boolean(r.rows[0]?.id)
  let code: string | null = null
  if (exists) {
    code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAtMs = Date.now() + 15 * 60 * 1000
    passwordResetCodes.set(email, { code, expiresAtMs })
    app.log.warn({ email }, `Password reset code generated (15 min): ${code}`)
  }

  // DEV ergonomics: when called from localhost, return the code so we can simulate "email link" UX
  // without integrating an email provider yet.
  const origin = String(req.headers?.origin ?? '').trim()
  const isLocalhost = origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173' || origin === 'http://localhost:4173' || origin === 'http://127.0.0.1:4173'
  const devCode = isLocalhost ? code : null

  return reply.send({ ok: true, devCode })
})

app.post('/api/auth/password/reset/confirm', async (req, reply) => {
  const Body = z.object({
    email: z.string().email(),
    code: z.string().min(4).max(32),
    newPassword: z.string().min(6),
  })
  const body = Body.parse(req.body)
  const email = body.email.toLowerCase()
  const saved = passwordResetCodes.get(email)
  if (!saved || saved.expiresAtMs < Date.now() || saved.code !== body.code.trim()) {
    return reply.code(400).send({ message: 'Invalid reset code' })
  }

  const pwHash = await hashPassword(body.newPassword)
  const upd = await db.pool.query(`update public.users set password_hash = $2, updated_at = now() where lower(email) = $1`, [
    email,
    pwHash,
  ])
  passwordResetCodes.delete(email)
  if (!upd.rowCount) return reply.code(400).send({ message: 'User not found' })
  return reply.send({ ok: true })
})

app.post('/api/auth/password/update', async (req, reply) => {
  const a = await requireAuth(req)
  const Body = z.object({ password: z.string().min(6) })
  const body = Body.parse(req.body)
  const pwHash = await hashPassword(body.password)
  await db.pool.query(`update public.users set password_hash = $2, updated_at = now() where id = $1`, [a.userId, pwHash])
  return reply.send({ ok: true })
})

app.post('/api/auth/refresh', async (req, reply) => {
  const refreshToken = String(req.cookies?.[env.REFRESH_COOKIE_NAME] ?? '')
  if (!refreshToken) return reply.code(401).send({ message: 'No refresh' })
  const rotated = await rotateRefreshSession(refreshToken, req, reply)
  if (!rotated) return reply.code(401).send({ message: 'Invalid refresh' })
  // mint new access
  const ur = await db.pool.query<{ id: string; email: string | null; display_name: string | null }>(
    `select id, email, display_name from public.users where id = $1`,
    [rotated.userId],
  )
  const u = ur.rows[0]
  if (!u?.id) return reply.code(401).send({ message: 'Invalid user' })
  const accessToken = await signAccessToken({ sub: u.id, email: u.email, displayName: u.display_name })
  return { accessToken }
})

app.post('/api/auth/logout', async (_req, reply) => {
  const refreshToken = String((_req as any).cookies?.[env.REFRESH_COOKIE_NAME] ?? '')
  if (refreshToken) await revokeRefreshSessionByToken(refreshToken)
  clearRefreshCookie(reply)
  return { ok: true }
})

app.get('/api/auth/session', async (req) => {
  // For now the client keeps access token; session endpoint just validates it.
  // IMPORTANT: frontend may call this while logged out; do not error.
  let a: { userId: string } | null = null
  try {
    a = await requireAuth(req)
  } catch {
    return { session: null }
  }
  const r = await db.pool.query<{ id: string; email: string | null; display_name: string | null }>(
    `select id, email, display_name from public.users where id = $1`,
    [a.userId],
  )
  const u = r.rows[0]
  if (!u) return { session: null }
  const accessToken = await signAccessToken({ sub: u.id, email: u.email, displayName: u.display_name })
  return { session: { accessToken, user: { id: u.id, email: u.email, displayName: u.display_name } } }
})

app.get('/api/auth/user', async (req, reply) => {
  try {
    const a = await requireAuth(req)
    const r = await db.pool.query<{ id: string; email: string | null; display_name: string | null }>(
      `select id, email, display_name from public.users where id = $1`,
      [a.userId],
    )
    const u = r.rows[0]
    return { user: u ? { id: u.id, email: u.email, displayName: u.display_name } : null }
  } catch {
    return reply.code(401).send({ user: null })
  }
})

app.patch('/api/auth/profile', async (req) => {
  const a = await requireAuth(req)
  const Body = z.object({
    displayName: z.string().min(1).max(160).nullable().optional(),
    avatarUrl: z.string().url().max(2048).nullable().optional(),
    profileSlug: z.string().min(2).max(32).nullable().optional(),
  })
  const body = Body.parse(req.body)
  const patch: any = {}
  if ('displayName' in body) patch.display_name = body.displayName
  if ('avatarUrl' in body) patch.avatar_url = body.avatarUrl
  if ('profileSlug' in body) patch.profile_slug = body.profileSlug
  patch.updated_at = new Date().toISOString()

  const cols = Object.keys(patch)
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
  const values = cols.map((c) => patch[c])
  values.push(a.userId)
  const q = `update public.users set ${sets} where id = $${values.length} returning id, email, display_name`
  const r = await db.pool.query(q, values)
  const u = r.rows[0]
  return { user: { id: u.id, email: u.email ?? null, displayName: u.display_name ?? null } }
})

// Legacy DB facade (PostgREST/RPC emulation) is forbidden: migration uses /api/v1/* only.
function legacyDbDisabled(): never {
  throw Object.assign(new Error('legacy_db_disabled'), { statusCode: 410 })
}

app.post('/api/db/rpc/:name', async () => legacyDbDisabled())

app.post('/api/db/select-one', async () => legacyDbDisabled())
app.post('/api/db/select', async () => legacyDbDisabled())
app.post('/api/db/insert', async () => legacyDbDisabled())
app.patch('/api/db/update', async () => legacyDbDisabled())
app.delete('/api/db/delete', async () => legacyDbDisabled())

app.post('/api/storage/upload', async (req, reply) => {
  await requireAuth(req)
  const parts = req.parts()
  let bucket = ''
  let path = ''
  let fileBuf: Buffer | null = null
  let contentType = 'application/octet-stream'

  for await (const p of parts) {
    if (p.type === 'file') {
      contentType = p.mimetype || contentType
      fileBuf = await p.toBuffer()
    } else {
      if (p.fieldname === 'bucket') bucket = String(p.value)
      if (p.fieldname === 'path') path = String(p.value)
    }
  }
  if (!bucket || !path || !fileBuf) return reply.code(400).send({ message: 'bad_upload' })
  const t = resolveStorageTarget(bucket, path)
  await s3.send(new PutObjectCommand({ Bucket: t.bucket, Key: t.key, Body: fileBuf, ContentType: contentType }))
  return { ok: true }
})

app.post('/api/storage/remove', async (req) => {
  await requireAuth(req)
  const Body = z.object({ bucket: z.string().min(1), paths: z.array(z.string().min(1)).max(1000) })
  const body = Body.parse(req.body)
  for (const p of body.paths) {
    const t = resolveStorageTarget(body.bucket, p)
    await s3.send(new DeleteObjectCommand({ Bucket: t.bucket, Key: t.key }))
  }
  return { ok: true }
})

app.post('/api/storage/signed-url', async (req, reply) => {
  await requireAuth(req)
  const Body = z.object({
    bucket: z.string().min(1),
    path: z.string().min(1),
    // Frontend may omit expiresInSec; default to short-lived URL.
    // Allow longer TTL for cached avatars/media (frontend uses 7 days).
    expiresInSec: z.coerce.number().int().positive().max(60 * 60 * 24 * 7).default(60),
  })
  const parsed = Body.safeParse(req.body)
  if (!parsed.success) {
    app.log.warn({ issues: parsed.error.issues, body: req.body }, 'storage_signed_url_bad_body')
    return reply.code(400).send({ message: 'bad_signed_url_request' })
  }
  const body = parsed.data
  let t: { bucket: string; key: string }
  try {
    t = resolveStorageTarget(body.bucket, body.path)
  } catch (e: any) {
    const statusCode = Number(e?.statusCode ?? 0) || 400
    app.log.warn({ err: e, bucket: body.bucket, path: body.path }, 'storage_signed_url_bad_target')
    return reply.code(statusCode).send({ message: e?.message ?? 'bad_storage_target' })
  }
  try {
    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: t.bucket, Key: t.key }),
      { expiresIn: body.expiresInSec },
    )
    return { signedUrl }
  } catch (e: any) {
    // When object is missing, do not fail the whole UI — just return no URL.
    const code = String(e?.name ?? e?.Code ?? e?.code ?? '')
    const status = Number(e?.$metadata?.httpStatusCode ?? 0)
    if (status === 404 || code === 'NoSuchKey' || code === 'NotFound' || code === 'NotFoundException') {
      return { signedUrl: null }
    }
    // Some S3-compatible providers return 403 AccessDenied for missing objects / private keys.
    if (status === 403 && (code === 'AccessDenied' || code === 'AccessDeniedException')) {
      return { signedUrl: null }
    }
    app.log.error({ err: e, bucket: body.bucket, path: body.path, resolved: t }, 'storage_signed_url_failed')
    throw e
  }
})

// --- Functions (Supabase Edge replacements) ---
type LinkPreview = { url: string; title?: string; description?: string; image?: string; siteName?: string }

function escapeReKey(key: string): string {
  return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function pickHtmlMeta(html: string, attr: 'property' | 'name', key: string): string | null {
  const k = escapeReKey(key)
  const a = attr === 'property' ? 'property' : 'name'
  let m = html.match(new RegExp(`<meta[^>]+${a}=["']${k}["'][^>]+content=["']([^"']+)["']`, 'i'))
  if (m?.[1]) return m[1].trim()
  m = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${a}=["']${k}["']`, 'i'))
  return m?.[1] ? m[1].trim() : null
}

function pickHtmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)
  return m?.[1] ? m[1].trim() : null
}

function isYoutubeHost(host: string): boolean {
  const h = host.toLowerCase()
  return (
    h === 'youtube.com' ||
    h === 'www.youtube.com' ||
    h === 'm.youtube.com' ||
    h === 'music.youtube.com' ||
    h === 'youtu.be' ||
    h === 'www.youtu.be'
  )
}

async function previewFromYoutubeOEmbed(pageUrl: string): Promise<LinkPreview | null> {
  try {
    const u = new URL(pageUrl)
    if (!isYoutubeHost(u.hostname)) return null
    const oembedUrl = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(pageUrl)}`
    const r = await fetch(oembedUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; redflow-link-preview/1.0)',
        accept: 'application/json',
      },
    })
    if (!r.ok) return null
    const j = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string; provider_name?: string }
    const title = typeof j.title === 'string' && j.title.trim() ? j.title.trim() : null
    if (!title) return null
    const out: LinkPreview = {
      url: pageUrl,
      title,
      siteName: typeof j.provider_name === 'string' && j.provider_name.trim() ? j.provider_name.trim() : 'YouTube',
    }
    if (typeof j.thumbnail_url === 'string' && j.thumbnail_url.trim()) out.image = j.thumbnail_url.trim()
    if (typeof j.author_name === 'string' && j.author_name.trim()) out.description = j.author_name.trim()
    return out
  } catch {
    return null
  }
}

app.post('/api/functions/link-preview', async (req, reply) => {
  await requireAuth(req)
  const Body = z.object({ url: z.string().min(1) })
  const body = Body.safeParse(req.body)
  if (!body.success) return reply.code(400).send({ error: 'invalid_url' })
  const url = body.data.url.trim()
  if (!/^https?:\/\//i.test(url)) return reply.code(400).send({ error: 'invalid_url' })

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return reply.code(400).send({ error: 'invalid_url' })
  }

  if (isYoutubeHost(parsedUrl.hostname)) {
    const yt = await previewFromYoutubeOEmbed(url)
    if (yt) return yt
  }

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 7000)
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; redflow-link-preview/1.0)',
        accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.toLowerCase().includes('text/html')) return { url }
    const html = (await res.text()).slice(0, 250_000)

    const title = pickHtmlMeta(html, 'property', 'og:title') || pickHtmlMeta(html, 'name', 'twitter:title') || pickHtmlTitle(html) || undefined
    const description =
      pickHtmlMeta(html, 'property', 'og:description') ||
      pickHtmlMeta(html, 'name', 'description') ||
      pickHtmlMeta(html, 'name', 'twitter:description') ||
      undefined
    const image = pickHtmlMeta(html, 'property', 'og:image') || pickHtmlMeta(html, 'name', 'twitter:image') || undefined
    const siteName = pickHtmlMeta(html, 'property', 'og:site_name') || undefined

    const out: LinkPreview = { url }
    if (title) out.title = title
    if (description) out.description = description
    if (image) out.image = image
    if (siteName) out.siteName = siteName
    return out
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'preview_failed'
    return reply.code(200).send({ url, error: msg })
  } finally {
    clearTimeout(t)
  }
})

// Public read endpoint (avatars): redirect to signed GET (or CDN).
app.get('/public/:bucket/*', async (req, reply) => {
  const bucket = String((req.params as any).bucket ?? '')
  const wildcard = String((req.params as any)['*'] ?? '')
  if (!bucket || !wildcard) return reply.code(404).send('not_found')
  const t = resolveStorageTarget(bucket, wildcard)
  const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: t.bucket, Key: t.key }), { expiresIn: 300 })
  return reply.redirect(signedUrl)
})

// --- WebSocket realtime (broadcast only, scaffold) ---
// Protocol:
// - wss://api2.redflow.online/ws?access_token=...
// - {"type":"subscribe","channel":"room-mod:abc"}
// - {"type":"broadcast","channel":"room-mod:abc","event":"join-request","payload":{...}}
type WsClient = {
  userId: string
  ws: import('ws').WebSocket
  channels: Set<string>
}

const wsClients = new Set<WsClient>()

function broadcast(channel: string, event: string, payload: unknown): void {
  const msg = JSON.stringify({ type: 'broadcast', channel, event, payload })
  for (const c of wsClients) {
    if (!c.channels.has(channel)) continue
    try {
      c.ws.send(msg)
    } catch {
      /* noop */
    }
  }
}

function broadcastDbChange(channel: string, table: string, action: 'INSERT' | 'UPDATE' | 'DELETE', row: unknown): void {
  const msg = JSON.stringify({ type: 'db_change', channel, table, action, row })
  for (const c of wsClients) {
    if (!c.channels.has(channel)) continue
    try {
      c.ws.send(msg)
    } catch {
      /* noop */
    }
  }
}

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws: any, req: any, client: WsClient) => {
  ws.on('message', (raw: any) => {
    let msg: any
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    const type = String(msg?.type ?? '')
    if (type === 'subscribe') {
      const ch = String(msg?.channel ?? '').trim()
      if (ch) client.channels.add(ch)
      return
    }
    if (type === 'unsubscribe') {
      const ch = String(msg?.channel ?? '').trim()
      if (ch) client.channels.delete(ch)
      return
    }
    if (type === 'broadcast') {
      const ch = String(msg?.channel ?? '').trim()
      const ev = String(msg?.event ?? '').trim()
      if (!ch || !ev) return
      // IMPORTANT: production must restrict who can broadcast where.
      broadcast(ch, ev, msg?.payload)
    }
  })
})

await ensureDbChangeTriggers(db.pool)

await startDbChangeListener({
  pool: db.pool,
  logger: app.log,
  onEvent: async (e) => {
    const table = String(e.table ?? '').trim()
    const action = e.action
    const row = (e.row ?? {}) as Record<string, unknown>
    if (!table || !action || !row) return

    // Base routing: conversation scoped streams.
    const cid = typeof row.conversation_id === 'string' ? row.conversation_id.trim() : ''
    if (table === 'chat_messages' && cid) {
      broadcastDbChange(`dm-thread:${cid}`, table, action, row)
      broadcastDbChange(`group-thread:${cid}`, table, action, row)
      broadcastDbChange(`channel-thread:${cid}`, table, action, row)

      // Per-user unread refresh: notify all members of the conversation.
      if (action === 'INSERT') {
        const senderId = typeof row.sender_user_id === 'string' ? row.sender_user_id.trim() : ''
        const mem = await db.pool.query(
          `select distinct user_id from public.chat_conversation_members where conversation_id=$1`,
          [cid],
        )
        for (const r of mem.rows) {
          const uid = typeof r.user_id === 'string' ? r.user_id.trim() : ''
          if (uid) broadcastDbChange(`messenger-unread:${uid}`, table, action, row)
          if (uid && uid !== senderId) {
            void sendWebPushToUser(db.pool, uid, {
              type: 'dm_message',
              conversationId: cid,
              title: 'Новое сообщение',
              body: typeof row.body === 'string' ? String(row.body).slice(0, 180) : 'Сообщение',
              createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
            })
          }
        }
      }
    }

    if (table === 'chat_conversation_members') {
      const uid = typeof row.user_id === 'string' ? row.user_id.trim() : ''
      if (uid) {
        broadcastDbChange(`messenger-my-reads:${uid}`, table, action, row)
        broadcastDbChange(`messenger-unread:${uid}`, table, action, row)
        if (action === 'DELETE') broadcastDbChange(`messenger-member-self-delete:${uid}`, table, action, row)
      }
      if (cid) broadcastDbChange(`dm-peer-read:${cid}`, table, action, row)
    }

    if (table === 'chat_message_mentions') {
      const uid = typeof row.user_id === 'string' ? row.user_id.trim() : ''
      if (uid) {
        broadcastDbChange(`mentions-${uid}`, table, action, row)
        if (action === 'INSERT') {
          void sendWebPushToUser(db.pool, uid, {
            type: 'mention',
            conversationId: cid || null,
            title: 'Вас упомянули',
            body: 'Откройте чат, чтобы посмотреть',
            createdAt: new Date().toISOString(),
          })
        }
      }
    }

    if (table === 'user_presence_public') {
      const uid = typeof row.user_id === 'string' ? row.user_id.trim() : ''
      if (uid) {
        broadcastDbChange(`peer-presence:${uid}`, table, action, row)
      }
    }
  },
})

app.addHook('onReady', async () => {
  app.server.on('upgrade', async (req: any, socket: any, head: any) => {
    try {
      const u = new URL(req.url ?? '', 'http://localhost')
      if (u.pathname !== '/ws') return
      const token = u.searchParams.get('access_token')?.trim() ?? ''
      if (!token) {
        socket.destroy()
        return
      }
      const claims = await verifyAccessToken(token)
      const client: WsClient = { userId: claims.sub, ws: undefined as any, channels: new Set() }
      wss.handleUpgrade(req, socket, head, (ws: any) => {
        client.ws = ws
        wsClients.add(client)
        ws.on('close', () => wsClients.delete(client))
        wss.emit('connection', ws, req, client)
      })
    } catch {
      socket.destroy()
    }
  })
})

await app.listen({ port: env.PORT, host: '0.0.0.0' })

