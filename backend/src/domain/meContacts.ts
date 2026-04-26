import type { Pool } from 'pg'
import { assertUuidList } from './uuidList.js'

export async function listMyContacts(pool: Pool, userId: string): Promise<unknown[]> {
  const r = await pool.query(
    `
      with
        outbound as (
          select favorite_user_id as target_user_id, created_at as favorited_at
            from public.user_favorites
           where user_id = $1
        ),
        inbound as (
          select user_id as target_user_id
            from public.user_favorites
           where favorite_user_id = $1
        ),
        targets as (
          select target_user_id from outbound
          union
          select target_user_id from inbound
        )
      select
        t.target_user_id,
        (o.target_user_id is not null) as outbound_favorite,
        (i.target_user_id is not null) as inbound_favorite,
        (o.target_user_id is not null) as is_favorite,
        (i.target_user_id is not null) as favors_me,
        (b1.blocked_user_id is not null) as blocked_by_me,
        (b2.blocked_user_id is not null) as blocked_me,
        o.favorited_at,
        u.display_name,
        u.profile_slug,
        u.avatar_url,
        u.status
      from targets t
      join public.users u on u.id = t.target_user_id
      left join outbound o on o.target_user_id = t.target_user_id
      left join inbound i on i.target_user_id = t.target_user_id
      left join public.user_blocks b1 on b1.blocker_user_id = $1 and b1.blocked_user_id = t.target_user_id
      left join public.user_blocks b2 on b2.blocker_user_id = t.target_user_id and b2.blocked_user_id = $1
      left join public.user_contact_list_hides h on h.owner_user_id = $1 and h.hidden_user_id = t.target_user_id
      where h.hidden_user_id is null
      order by
        (o.target_user_id is not null) desc,
        u.display_name asc
      `,
    [userId],
  )
  return r.rows
}

export async function getContactStatuses(pool: Pool, userId: string, targetUserIds: unknown): Promise<unknown[]> {
  const ids = assertUuidList(targetUserIds, 500)
  if (!ids.length) return []
  const r = await pool.query(
    `
      with requested as (
        select distinct unnest($2::uuid[]) as target_user_id
      )
      select
        r.target_user_id,
        exists(
          select 1
          from public.user_favorites f
          where f.user_id = $1
            and f.favorite_user_id = r.target_user_id
        ) as is_favorite,
        exists(
          select 1
          from public.user_favorites f
          where f.user_id = r.target_user_id
            and f.favorite_user_id = $1
        ) as favors_me,
        (
          exists(
            select 1
            from public.user_favorites f
            where f.user_id = $1
              and f.favorite_user_id = r.target_user_id
          )
          and exists(
            select 1
            from public.user_favorites f
            where f.user_id = r.target_user_id
              and f.favorite_user_id = $1
          )
        ) as is_friend,
        exists(
          select 1
          from public.user_blocks b
          where b.blocker_user_id = $1
            and b.blocked_user_id = r.target_user_id
        ) as blocked_by_me,
        exists(
          select 1
          from public.user_blocks b
          where b.blocker_user_id = r.target_user_id
            and b.blocked_user_id = $1
        ) as blocked_me
      from requested r
    `,
    [userId, ids],
  )
  return r.rows
}

export async function setUserFavorite(pool: Pool, userId: string, targetUserId: string, favorite: boolean): Promise<unknown> {
  const t = targetUserId.trim()
  if (!t) throw Object.assign(new Error('target_user_required'), { statusCode: 400 })
  if (t === userId) throw Object.assign(new Error('cannot_favorite_self'), { statusCode: 400 })

  if (favorite) {
    await pool.query(
      `insert into public.user_favorites (user_id, favorite_user_id, created_at, updated_at)
       values ($1, $2, now(), now())
       on conflict (user_id, favorite_user_id) do update set updated_at = now()`,
      [userId, t],
    )
  } else {
    await pool.query(`delete from public.user_favorites where user_id = $1 and favorite_user_id = $2`, [userId, t])
  }

  const favorsMe = await pool.query(
    `select 1 from public.user_favorites where user_id = $1 and favorite_user_id = $2 limit 1`,
    [t, userId],
  )

  return {
    ok: true,
    target_user_id: t,
    is_favorite: favorite,
    favors_me: Boolean(favorsMe.rowCount),
    is_friend: favorite && Boolean(favorsMe.rowCount),
  }
}

export async function setUserBlock(pool: Pool, userId: string, targetUserId: string, block: boolean): Promise<unknown> {
  const t = targetUserId.trim()
  if (!t) throw Object.assign(new Error('target_user_required'), { statusCode: 400 })
  if (t === userId) throw Object.assign(new Error('cannot_block_self'), { statusCode: 400 })

  if (block) {
    await pool.query(
      `insert into public.user_blocks (blocker_user_id, blocked_user_id, created_at)
       values ($1, $2, now())
       on conflict (blocker_user_id, blocked_user_id) do nothing`,
      [userId, t],
    )
  } else {
    await pool.query(`delete from public.user_blocks where blocker_user_id = $1 and blocked_user_id = $2`, [userId, t])
  }

  const blockedByMe = await pool.query(
    `select 1 from public.user_blocks where blocker_user_id = $1 and blocked_user_id = $2 limit 1`,
    [userId, t],
  )
  const blockedMe = await pool.query(
    `select 1 from public.user_blocks where blocker_user_id = $1 and blocked_user_id = $2 limit 1`,
    [t, userId],
  )
  return { ok: true, target_user_id: t, blocked_by_me: Boolean(blockedByMe.rowCount), blocked_me: Boolean(blockedMe.rowCount) }
}

export async function hideContactFromMyList(pool: Pool, userId: string, hiddenUserId: string): Promise<unknown> {
  const t = hiddenUserId.trim()
  if (!t || t === userId) return { ok: false, error: 'invalid_target' }

  await pool.query(
    `insert into public.user_contact_list_hides (owner_user_id, hidden_user_id)
     values ($1, $2)
     on conflict (owner_user_id, hidden_user_id) do nothing`,
    [userId, t],
  )

  // If peer already hid me -> mutual unfriend: delete direct conversation between us.
  const peerHid = await pool.query(
    `select 1 from public.user_contact_list_hides where owner_user_id = $1 and hidden_user_id = $2 limit 1`,
    [t, userId],
  )
  let deletedPeerDmId: string | null = null
  if (peerHid.rowCount) {
    const dm = await pool.query<{ id: string }>(
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
      [userId, t],
    )
    deletedPeerDmId = dm.rows[0]?.id ?? null
    if (deletedPeerDmId) {
      await pool.query(`delete from public.chat_conversations where id = $1`, [deletedPeerDmId])
    }
  }

  return { ok: true, deleted_peer_dm_id: deletedPeerDmId }
}

export async function searchRegisteredUsers(pool: Pool, userId: string, query: string, limit: number): Promise<unknown[]> {
  let q = String(query ?? '').trim()
  while (q.startsWith('@')) q = q.slice(1).trim()
  const lim = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)))
  if (q.length < 2) return []

  const r = await pool.query(
    `
      with t as (select lower($2::text) as q)
      select u.id, u.display_name, u.profile_slug, u.avatar_url
      from public.users u, t
      where u.id <> $1
        and u.status = 'active'
        and length(t.q) >= 2
        and (
          position(t.q in lower(coalesce(u.display_name, ''))) > 0
          or position(t.q in lower(coalesce(u.profile_slug, ''))) > 0
        )
        and not exists (select 1 from public.user_blocks b where b.blocker_user_id = $1 and b.blocked_user_id = u.id)
        and not exists (select 1 from public.user_blocks b where b.blocker_user_id = u.id and b.blocked_user_id = $1)
      order by
        case when lower(coalesce(u.profile_slug, '')) = t.q then 0 else 1 end,
        u.display_name asc nulls last
      limit $3
    `,
    [userId, q.toLowerCase(), lim],
  )
  return r.rows
}

export async function listMyContactAliasRows(pool: Pool, ownerUserId: string, contactUserIds: unknown): Promise<unknown[]> {
  const ids = assertUuidList(contactUserIds, 500)
  if (!ids.length) return []
  const r = await pool.query(
    `select contact_user_id, alias, display_avatar_url
       from public.contact_aliases
      where owner_user_id = $1
        and contact_user_id = any($2::uuid[])`,
    [ownerUserId, ids],
  )
  return r.rows
}

export async function setMyContactAlias(pool: Pool, ownerUserId: string, contactUserId: string, alias: string): Promise<unknown> {
  const cid = contactUserId.trim()
  if (!cid) return { ok: false, error: 'target_required' }
  if (cid === ownerUserId) return { ok: false, error: 'forbidden' }

  let a = String(alias ?? '').trim()
  if (!a) {
    await pool.query(
      `update public.contact_aliases set alias = null where owner_user_id = $1 and contact_user_id = $2`,
      [ownerUserId, cid],
    )
    await pool.query(
      `delete from public.contact_aliases
        where owner_user_id = $1 and contact_user_id = $2
          and (alias is null or char_length(btrim(alias)) = 0)
          and (display_avatar_url is null or char_length(btrim(display_avatar_url)) = 0)`,
      [ownerUserId, cid],
    )
    return { ok: true, alias: null }
  }

  if (a.length > 64) a = a.slice(0, 64)
  await pool.query(
    `insert into public.contact_aliases(owner_user_id, contact_user_id, alias, display_avatar_url)
     values ($1, $2, $3, null)
     on conflict (owner_user_id, contact_user_id)
     do update set alias = excluded.alias`,
    [ownerUserId, cid, a],
  )
  return { ok: true, alias: a }
}

export async function setMyContactDisplayAvatar(
  pool: Pool,
  ownerUserId: string,
  contactUserId: string,
  displayAvatarUrl: string,
): Promise<unknown> {
  const cid = contactUserId.trim()
  if (!cid) return { ok: false, error: 'target_required' }
  if (cid === ownerUserId) return { ok: false, error: 'forbidden' }

  let u = String(displayAvatarUrl ?? '').trim()
  if (!u) {
    await pool.query(
      `update public.contact_aliases set display_avatar_url = null where owner_user_id = $1 and contact_user_id = $2`,
      [ownerUserId, cid],
    )
    await pool.query(
      `delete from public.contact_aliases
        where owner_user_id = $1 and contact_user_id = $2
          and (alias is null or char_length(btrim(alias)) = 0)
          and (display_avatar_url is null or char_length(btrim(display_avatar_url)) = 0)`,
      [ownerUserId, cid],
    )
    return { ok: true, display_avatar_url: null }
  }

  if (u.length > 2048) u = u.slice(0, 2048)
  await pool.query(
    `insert into public.contact_aliases(owner_user_id, contact_user_id, alias, display_avatar_url)
     values ($1, $2, null, $3)
     on conflict (owner_user_id, contact_user_id)
     do update set display_avatar_url = excluded.display_avatar_url`,
    [ownerUserId, cid, u],
  )
  return { ok: true, display_avatar_url: u }
}

export async function getMyConversationNotificationMuteRows(
  pool: Pool,
  userId: string,
  conversationIds: unknown,
): Promise<unknown[]> {
  const ids = assertUuidList(conversationIds, 500)
  if (!ids.length) return []
  const r = await pool.query(
    `select m.conversation_id, m.muted
       from public.chat_conversation_notification_mutes m
       join public.chat_conversation_members me
         on me.conversation_id = m.conversation_id
        and me.user_id = $1
      where m.user_id = $1
        and m.conversation_id = any($2::uuid[])`,
    [userId, ids],
  )
  return r.rows
}
