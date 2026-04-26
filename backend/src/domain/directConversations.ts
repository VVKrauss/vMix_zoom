import type { Pool } from 'pg'
import { ensureSelfDirectConversation } from './messengerLists.js'

async function usersAreMutualContacts(pool: Pool, a: string, b: string): Promise<boolean> {
  const r = await pool.query(
    `
    select
      exists(select 1 from public.user_favorites where user_id = $1 and favorite_user_id = $2) as a_to_b,
      exists(select 1 from public.user_favorites where user_id = $2 and favorite_user_id = $1) as b_to_a
    `,
    [a, b],
  )
  const row = r.rows[0] as any
  return row?.a_to_b === true && row?.b_to_a === true
}

export async function ensureDirectConversationWithUser(pool: Pool, args: { userId: string; targetUserId: string; targetTitle?: string | null }): Promise<string> {
  const me = args.userId
  const target = args.targetUserId.trim()
  const title = (args.targetTitle ?? '').trim().slice(0, 200) || null
  if (!target) throw Object.assign(new Error('target_user_required'), { statusCode: 400 })
  if (target === me) {
    return await ensureSelfDirectConversation(pool, me)
  }

  // existing DM between exactly these two
  const existing = await pool.query<{ id: string }>(
    `
      select c.id
      from public.chat_conversations c
      join public.chat_conversation_members m on m.conversation_id = c.id
      where c.kind = 'direct'
      group by c.id
      having count(*) = 2
         and bool_or(m.user_id = $1)
         and bool_or(m.user_id = $2)
         and bool_and(m.user_id in ($1::uuid, $2::uuid))
      order by max(c.created_at) desc
      limit 1
    `,
    [me, target],
  )
  const found = existing.rows[0]?.id
  if (found) {
    if (title) await pool.query(`update public.chat_conversations set title = coalesce(title, $2) where id = $1`, [found, title])
    return found
  }

  // DM privacy gate: dm_allow_from = contacts_only ⇒ need mutual favorites
  const pref = await pool.query<{ dm_allow_from: string | null }>(`select dm_allow_from from public.users where id = $1`, [target])
  const dmAllowFrom = (pref.rows[0]?.dm_allow_from ?? 'everyone').toString()
  if (dmAllowFrom === 'contacts_only') {
    const ok = await usersAreMutualContacts(pool, me, target)
    if (!ok) throw Object.assign(new Error('dm_not_allowed'), { statusCode: 403 })
  }

  // create conversation + members
  const created = await pool.query<{ id: string }>(
    `insert into public.chat_conversations (id, kind, title, created_by, created_at, closed_at)
     values (gen_random_uuid(), 'direct', $2, $1, now(), null)
     returning id`,
    [me, title ?? 'Личный чат'],
  )
  const cid = created.rows[0]?.id
  if (!cid) throw new Error('create_conversation_failed')
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
     values ($1, $2, 'owner', now()), ($1, $3, 'member', now())
     on conflict do nothing`,
    [cid, me, target],
  )
  return cid
}

