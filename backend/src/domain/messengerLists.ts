import type { Pool } from 'pg'

/** Lists direct (1:1) conversations for the sidebar; same rows as legacy `list_my_direct_conversations` RPC. */
export async function listMyDirectConversations(pool: Pool, userId: string): Promise<unknown[]> {
  const r = await pool.query(
    `
      select *
      from (
        select distinct on (c.id)
        c.id,
        c.title,
        c.created_at,
        c.last_message_at,
        c.last_message_preview,
        c.message_count,
        other.user_id as other_user_id,
        u.display_name as other_display_name,
        u.avatar_url as other_avatar_url,
        (
          select count(*)
            from public.chat_messages m
           where m.conversation_id = c.id
             and m.sender_user_id is distinct from $1
             and m.created_at > coalesce(me.last_read_at, 'epoch'::timestamptz)
        )::int as unread_count
        from public.chat_conversations c
        join public.chat_conversation_members me
          on me.conversation_id = c.id
         and me.user_id = $1
        left join lateral (
          select m2.user_id
            from public.chat_conversation_members m2
           where m2.conversation_id = c.id
             and m2.user_id <> $1
           limit 1
        ) other on true
        left join public.users u on u.id = other.user_id
        where c.kind = 'direct'
        order by c.id, c.last_message_at desc nulls last, c.created_at desc
      ) t
      order by t.last_message_at desc nulls last, t.created_at desc
      `,
    [userId],
  )
  return r.rows
}

export async function listMyGroupChats(pool: Pool, userId: string): Promise<unknown[]> {
  const r = await pool.query(
    `
      select *
      from (
        select distinct on (c.id)
        c.id,
        c.title,
        c.created_at,
        c.last_message_at,
        c.last_message_preview,
        c.message_count,
        c.group_is_public as is_public,
        c.public_nick,
        c.avatar_path,
        c.avatar_thumb_path,
        (select count(*)::int from public.chat_conversation_members m where m.conversation_id = c.id) as member_count,
        c.required_subscription_plan,
        null::uuid as other_user_id,
        null::text as other_display_name,
        null::text as other_avatar_url,
        0::int as unread_count
        from public.chat_conversations c
        join public.chat_conversation_members me
          on me.conversation_id = c.id
         and me.user_id = $1
        where c.kind = 'group'
        order by c.id, c.last_message_at desc nulls last, c.created_at desc
      ) t
      order by t.last_message_at desc nulls last, t.created_at desc
      `,
    [userId],
  )
  return r.rows
}

export async function listMyChannels(pool: Pool, userId: string): Promise<unknown[]> {
  const r = await pool.query(
    `
      select *
      from (
        select distinct on (c.id)
        c.id,
        c.title,
        c.created_at,
        c.last_message_at,
        c.last_message_preview,
        c.message_count,
        c.channel_is_public as is_public,
        coalesce(c.channel_posting_mode, 'admins_only') as posting_mode,
        coalesce(c.channel_comments_mode, 'everyone') as comments_mode,
        c.public_nick,
        c.avatar_path,
        c.avatar_thumb_path,
        (select count(*)::int from public.chat_conversation_members m where m.conversation_id = c.id) as member_count,
        c.required_subscription_plan,
        null::uuid as other_user_id,
        null::text as other_display_name,
        null::text as other_avatar_url,
        0::int as unread_count
        from public.chat_conversations c
        join public.chat_conversation_members me
          on me.conversation_id = c.id
         and me.user_id = $1
        where c.kind = 'channel'
        order by c.id, c.last_message_at desc nulls last, c.created_at desc
      ) t
      order by t.last_message_at desc nulls last, t.created_at desc
      `,
    [userId],
  )
  return r.rows
}

/** Creates (or returns existing) 1:1 self conversation ("Saved"). */
export async function ensureSelfDirectConversation(pool: Pool, userId: string): Promise<string> {
  const existing = await pool.query<{ id: string }>(
    `
      select c.id
        from public.chat_conversations c
        join public.chat_conversation_members m on m.conversation_id = c.id
       where c.kind = 'direct'
         and m.user_id = $1
         and not exists (
           select 1 from public.chat_conversation_members m2
            where m2.conversation_id = c.id
              and m2.user_id <> $1
         )
       limit 1
    `,
    [userId],
  )
  const found = existing.rows[0]?.id
  if (found) return found

  const created = await pool.query<{ id: string }>(
    `insert into public.chat_conversations (id, kind, title, created_by, created_at)
     values (gen_random_uuid(), 'direct', null, $1, now())
     returning id`,
    [userId],
  )
  const cid = created.rows[0]?.id
  if (!cid) throw new Error('create_conversation_failed')
  await pool.query(
    `insert into public.chat_conversation_members (conversation_id, user_id, role, joined_at)
     values ($1, $2, 'owner', now())
     on conflict do nothing`,
    [cid, userId],
  )
  return cid
}
