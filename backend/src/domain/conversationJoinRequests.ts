import type { Pool } from 'pg'

async function conversationKind(pool: Pool, conversationId: string): Promise<'group' | 'channel' | null> {
  const r = await pool.query<{ kind: string }>(
    `select kind from public.chat_conversations where id = $1 and closed_at is null limit 1`,
    [conversationId],
  )
  const k = r.rows[0]?.kind
  return k === 'group' || k === 'channel' ? k : null
}

async function isConversationAdmin(pool: Pool, conversationId: string, userId: string): Promise<boolean> {
  const r = await pool.query<{ role: string }>(
    `select role from public.chat_conversation_members where conversation_id = $1 and user_id = $2 limit 1`,
    [conversationId, userId],
  )
  const role = r.rows[0]?.role ?? 'member'
  return role === 'owner' || role === 'admin' || role === 'moderator'
}

export async function hasPendingConversationJoinRequest(
  pool: Pool,
  args: { userId: string; conversationId: string },
): Promise<boolean> {
  const cid = args.conversationId.trim()
  const r = await pool.query(`select 1 from public.chat_conversation_join_requests where conversation_id=$1 and user_id=$2 limit 1`, [
    cid,
    args.userId,
  ])
  return !!r.rowCount
}

export async function requestConversationJoin(
  pool: Pool,
  args: { userId: string; conversationId: string },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  if (!cid) return { ok: false, error: 'conversation_required' }
  const kind = await conversationKind(pool, cid)
  if (!kind) return { ok: false, error: 'not_found' }

  const already = await pool.query(
    `select 1 from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`,
    [cid, args.userId],
  )
  if (already.rowCount) return { ok: true, already_member: true }

  const reqPlan = await pool.query<{ required_subscription_plan: string | null }>(
    `select required_subscription_plan from public.chat_conversations where id=$1 limit 1`,
    [cid],
  )
  const required = reqPlan.rows[0]?.required_subscription_plan ?? null
  if (required) {
    const ok = await pool.query(
      `
      select 1
        from public.account_subscriptions s
        join public.subscription_plans p on p.id = s.plan_id
       where s.status = 'active'
         and s.account_id in (select account_id from public.account_members where user_id = $1)
         and p.title = $2
       limit 1
      `,
      [args.userId, required],
    )
    if (!ok.rowCount) return { ok: false, error: 'subscription_required', required_plan: required }
  }

  await pool.query(
    `insert into public.chat_conversation_join_requests (conversation_id, user_id)
     values ($1,$2)
     on conflict (conversation_id, user_id) do nothing`,
    [cid, args.userId],
  )
  return { ok: true, requested: true }
}

export async function listConversationJoinRequests(
  pool: Pool,
  args: { userId: string; conversationId: string },
): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  const kind = await conversationKind(pool, cid)
  if (!kind) throw Object.assign(new Error('not_found'), { statusCode: 404 })
  if (!(await isConversationAdmin(pool, cid, args.userId))) throw Object.assign(new Error('forbidden'), { statusCode: 403 })

  const r = await pool.query(
    `
    select r.request_id, r.user_id, coalesce(u.display_name,'Пользователь')::text as display_name, r.created_at
      from public.chat_conversation_join_requests r
      join public.users u on u.id = r.user_id
     where r.conversation_id = $1
     order by r.created_at asc
    `,
    [cid],
  )
  return r.rows
}

export async function approveConversationJoinRequest(pool: Pool, args: { userId: string; requestId: string }): Promise<unknown> {
  const rid = args.requestId.trim()
  if (!rid) return { ok: false, error: 'request_required' }
  const req = await pool.query<{ conversation_id: string; user_id: string }>(
    `select conversation_id, user_id from public.chat_conversation_join_requests where request_id=$1`,
    [rid],
  )
  const row = req.rows[0]
  if (!row) return { ok: false, error: 'not_found' }
  if (!(await isConversationAdmin(pool, row.conversation_id, args.userId))) return { ok: false, error: 'forbidden' }
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role)
     values ($1,$2,'member')
     on conflict (conversation_id, user_id) do nothing`,
    [row.conversation_id, row.user_id],
  )
  await pool.query(`delete from public.chat_conversation_join_requests where request_id=$1`, [rid])
  return { ok: true }
}

export async function denyConversationJoinRequest(pool: Pool, args: { userId: string; requestId: string }): Promise<unknown> {
  const rid = args.requestId.trim()
  if (!rid) return { ok: false, error: 'request_required' }
  const req = await pool.query<{ conversation_id: string }>(
    `select conversation_id from public.chat_conversation_join_requests where request_id=$1`,
    [rid],
  )
  const row = req.rows[0]
  if (!row) return { ok: false, error: 'not_found' }
  if (!(await isConversationAdmin(pool, row.conversation_id, args.userId))) return { ok: false, error: 'forbidden' }
  await pool.query(`delete from public.chat_conversation_join_requests where request_id=$1`, [rid])
  return { ok: true }
}

