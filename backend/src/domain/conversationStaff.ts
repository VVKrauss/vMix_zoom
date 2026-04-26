import type { Pool } from 'pg'

async function assertGroupOrChannelStaff(pool: Pool, conversationId: string, userId: string): Promise<{ kind: 'group' | 'channel' }> {
  const r = await pool.query<{ kind: string; role: string }>(
    `
    select c.kind, m.role
      from public.chat_conversations c
      join public.chat_conversation_members m
        on m.conversation_id = c.id
     where c.id = $1
       and c.closed_at is null
       and m.user_id = $2
     limit 1
    `,
    [conversationId, userId],
  )
  const row = r.rows[0]
  if (!row || (row.kind !== 'group' && row.kind !== 'channel')) throw Object.assign(new Error('not_found'), { statusCode: 404 })
  const role = row.role ?? 'member'
  if (role !== 'owner' && role !== 'admin' && role !== 'moderator') throw Object.assign(new Error('forbidden'), { statusCode: 403 })
  return { kind: row.kind as 'group' | 'channel' }
}

async function assertCanAssignStaffRoles(pool: Pool, conversationId: string, userId: string): Promise<void> {
  const r = await pool.query<{ role: string }>(
    `
    select m.role
      from public.chat_conversation_members m
      join public.chat_conversations c on c.id = m.conversation_id
     where m.conversation_id = $1
       and m.user_id = $2
       and c.closed_at is null
       and c.kind in ('group','channel')
     limit 1
    `,
    [conversationId, userId],
  )
  const role = r.rows[0]?.role ?? 'member'
  if (role !== 'owner' && role !== 'admin') throw Object.assign(new Error('forbidden'), { statusCode: 403 })
}

export async function listConversationMembersForManagement(
  pool: Pool,
  args: { userId: string; conversationId: string },
): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  await assertGroupOrChannelStaff(pool, cid, args.userId)
  const r = await pool.query(
    `
    select user_id, member_role, display_name
      from (
        select distinct on (m.user_id)
          m.user_id,
          m.role as member_role,
          coalesce(nullif(btrim(u.display_name), ''), 'Пользователь')::text as display_name,
          case m.role
            when 'owner' then 0
            when 'admin' then 1
            when 'moderator' then 2
            else 3
          end as role_rank
        from public.chat_conversation_members m
        join public.chat_conversations c on c.id = m.conversation_id
        left join public.users u on u.id = m.user_id
        where m.conversation_id = $1
          and c.kind in ('group','channel')
          and c.closed_at is null
        order by m.user_id asc, role_rank asc
      ) t
     order by
      t.role_rank asc,
      t.display_name asc,
      t.user_id asc
    `,
    [cid],
  )
  return r.rows
}

export async function removeConversationMemberByStaff(
  pool: Pool,
  args: { userId: string; conversationId: string; targetUserId: string },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  const target = args.targetUserId.trim()
  if (!cid || !target) return { ok: false, error: 'params_required' }
  if (target === args.userId) return { ok: false, error: 'use_leave' }

  await assertGroupOrChannelStaff(pool, cid, args.userId)
  const roles = await pool.query<{ caller_role: string; target_role: string }>(
    `
    select
      (select role from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1) as caller_role,
      (select role from public.chat_conversation_members where conversation_id=$1 and user_id=$3 limit 1) as target_role
    `,
    [cid, args.userId, target],
  )
  const callerRole = roles.rows[0]?.caller_role ?? null
  const targetRole = roles.rows[0]?.target_role ?? null
  if (!targetRole) return { ok: false, error: 'not_member' }
  if (targetRole === 'owner') return { ok: false, error: 'cannot_remove_owner' }
  if (callerRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) return { ok: false, error: 'forbidden' }

  await pool.query(`delete from public.chat_conversation_members where conversation_id=$1 and user_id=$2`, [cid, target])
  await pool.query(`delete from public.chat_conversation_join_requests where conversation_id=$1 and user_id=$2`, [cid, target])
  return { ok: true }
}

export async function listConversationStaffMembers(pool: Pool, args: { userId: string; conversationId: string }): Promise<unknown[]> {
  const cid = args.conversationId.trim()
  await assertCanAssignStaffRoles(pool, cid, args.userId)
  const r = await pool.query(
    `
    select
      m.user_id,
      m.role as member_role,
      coalesce(nullif(btrim(u.display_name), ''), 'Пользователь')::text as display_name
    from public.chat_conversation_members m
    join public.chat_conversations c on c.id = m.conversation_id
    left join public.users u on u.id = m.user_id
    where m.conversation_id = $1
      and c.kind in ('group','channel')
      and c.closed_at is null
      and m.role <> 'owner'
    order by display_name asc, m.user_id asc
    `,
    [cid],
  )
  return r.rows
}

export async function setConversationMemberStaffRole(
  pool: Pool,
  args: { userId: string; conversationId: string; targetUserId: string; newRole: 'member' | 'moderator' | 'admin' },
): Promise<unknown> {
  const cid = args.conversationId.trim()
  const target = args.targetUserId.trim()
  if (!cid || !target) return { ok: false, error: 'conversation_required' }
  if (target === args.userId) return { ok: false, error: 'cannot_change_self' }
  const newRole = args.newRole
  if (newRole !== 'member' && newRole !== 'moderator' && newRole !== 'admin') return { ok: false, error: 'invalid_role' }

  // only owner/admin may assign roles
  const caller = await pool.query<{ role: string }>(
    `select m.role from public.chat_conversation_members m join public.chat_conversations c on c.id=m.conversation_id where m.conversation_id=$1 and m.user_id=$2 and c.kind in ('group','channel') and c.closed_at is null limit 1`,
    [cid, args.userId],
  )
  const callerRole = caller.rows[0]?.role ?? null
  if (!callerRole) return { ok: false, error: 'forbidden' }
  if (callerRole !== 'owner' && callerRole !== 'admin') return { ok: false, error: 'forbidden' }

  const targetRow = await pool.query<{ role: string }>(
    `select role from public.chat_conversation_members where conversation_id=$1 and user_id=$2 limit 1`,
    [cid, target],
  )
  const targetRole = targetRow.rows[0]?.role ?? null
  if (!targetRole) return { ok: false, error: 'target_not_member' }
  if (targetRole === 'owner') return { ok: false, error: 'cannot_change_owner' }

  if (callerRole === 'admin') {
    if (newRole === 'admin') return { ok: false, error: 'only_owner_promotes_admin' }
    if (targetRole === 'admin') return { ok: false, error: 'cannot_change_other_admin' }
  }

  await pool.query(`update public.chat_conversation_members set role=$3 where conversation_id=$1 and user_id=$2`, [cid, target, newRole])
  return { ok: true }
}

