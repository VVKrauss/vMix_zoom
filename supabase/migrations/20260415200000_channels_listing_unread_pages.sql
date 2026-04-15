-- Channels: listing + unread counts + paging posts/comments.

create or replace function public.mark_channel_read(
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  update public.chat_conversation_members
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = v_user_id;

  get diagnostics v_updated = row_count;

  return jsonb_build_object('ok', true, 'updated', v_updated);
end;
$$;

grant execute on function public.mark_channel_read(uuid) to authenticated;

-- List of channels I'm in (with unread count).
create or replace function public.list_my_channels()
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count integer,
  unread_count integer,
  is_public boolean,
  posting_mode text,
  comments_mode text
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with my_membership as (
    select m.conversation_id, m.last_read_at
    from public.chat_conversation_members m
    where m.user_id = auth.uid()
  ),
  chans as (
    select
      c.id,
      c.title,
      c.created_at,
      c.last_message_at,
      c.last_message_preview,
      c.message_count,
      c.channel_is_public,
      c.channel_posting_mode,
      c.channel_comments_mode,
      mm.last_read_at
    from public.chat_conversations c
    join my_membership mm
      on mm.conversation_id = c.id
    where c.kind = 'channel'
      and c.closed_at is null
  ),
  unread as (
    select
      ch.id as conversation_id,
      count(msg.id)::integer as unread_count
    from chans ch
    left join public.chat_messages msg
      on msg.conversation_id = ch.id
     and msg.created_at > coalesce(ch.last_read_at, to_timestamp(0))
     and msg.kind in ('text','system','image')
     and msg.reply_to_message_id is null
    group by ch.id
  )
  select
    ch.id,
    coalesce(nullif(btrim(ch.title), ''), 'Канал') as title,
    ch.created_at,
    ch.last_message_at,
    ch.last_message_preview,
    ch.message_count,
    coalesce(u.unread_count, 0) as unread_count,
    ch.channel_is_public as is_public,
    coalesce(ch.channel_posting_mode, 'admins_only') as posting_mode,
    coalesce(ch.channel_comments_mode, 'everyone') as comments_mode
  from chans ch
  left join unread u
    on u.conversation_id = ch.id
  order by coalesce(ch.last_message_at, ch.created_at) desc;
$$;

grant execute on function public.list_my_channels() to authenticated;

-- Page posts: newest first in storage, return chronological (like listDirectMessagesPage).
create or replace function public.list_channel_posts_page(
  p_conversation_id uuid,
  p_limit int default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  sender_user_id uuid,
  sender_name_snapshot text,
  kind text,
  body text,
  meta jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  reply_to_message_id uuid
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    m.id,
    m.sender_user_id,
    m.sender_name_snapshot,
    m.kind,
    m.body,
    m.meta,
    m.created_at,
    m.edited_at,
    m.reply_to_message_id
  from public.chat_messages m
  cross join me
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id is null
    and exists(
      select 1
      from public.chat_conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = me.uid
    )
    and (
      p_before_created_at is null
      or (
        m.created_at < p_before_created_at
        or (m.created_at = p_before_created_at and (p_before_id is null or m.id < p_before_id))
      )
    )
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 30), 80));
$$;

grant execute on function public.list_channel_posts_page(uuid, int, timestamptz, uuid) to authenticated;

-- Page comments for a post.
create or replace function public.list_channel_comments_page(
  p_conversation_id uuid,
  p_post_id uuid,
  p_limit int default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  sender_user_id uuid,
  sender_name_snapshot text,
  kind text,
  body text,
  meta jsonb,
  created_at timestamptz,
  edited_at timestamptz,
  reply_to_message_id uuid
)
language sql
security definer
set search_path to 'public', 'auth'
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    m.id,
    m.sender_user_id,
    m.sender_name_snapshot,
    m.kind,
    m.body,
    m.meta,
    m.created_at,
    m.edited_at,
    m.reply_to_message_id
  from public.chat_messages m
  cross join me
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id = p_post_id
    and exists(
      select 1
      from public.chat_conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = me.uid
    )
    and (
      p_before_created_at is null
      or (
        m.created_at < p_before_created_at
        or (m.created_at = p_before_created_at and (p_before_id is null or m.id < p_before_id))
      )
    )
  order by m.created_at desc, m.id desc
  limit greatest(1, least(coalesce(nullif(p_limit, 0), 50), 120));
$$;

grant execute on function public.list_channel_comments_page(uuid, uuid, int, timestamptz, uuid) to authenticated;

