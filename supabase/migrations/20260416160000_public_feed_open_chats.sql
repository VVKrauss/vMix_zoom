-- Allow reading feed of open groups/channels without membership.
-- Read-only is enforced by existing RLS and by keeping write RPC membership checks.

-- Group: allow list_group_messages_page for members OR open groups.
create or replace function public.list_group_messages_page(
  p_conversation_id uuid,
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
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 120));
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_required';
  end if;

  if not exists (
    select 1
    from public.chat_conversations c
    where c.id = p_conversation_id
      and c.closed_at is null
      and c.kind = 'group'
      and (
        c.group_is_public = true
        or exists (
          select 1
          from public.chat_conversation_members m
          where m.conversation_id = c.id
            and m.user_id = v_uid
        )
      )
  ) then
    raise exception 'forbidden';
  end if;

  if p_before_created_at is not null and p_before_id is null then
    raise exception 'cursor_incomplete';
  end if;

  return query
  select
    x.id,
    x.sender_user_id,
    x.sender_name_snapshot,
    x.kind,
    x.body,
    x.meta,
    x.created_at,
    x.edited_at,
    x.reply_to_message_id
  from (
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
    where m.conversation_id = p_conversation_id
      and (
        p_before_created_at is null
        or (m.created_at, m.id) < (p_before_created_at, p_before_id)
      )
    order by m.created_at desc, m.id desc
    limit v_lim
  ) x
  order by x.created_at asc, x.id asc;
end;
$$;

grant execute on function public.list_group_messages_page(uuid, int, timestamptz, uuid) to authenticated;

-- Channel: allow list_channel_posts_page for members OR open channels.
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
  ),
  access as (
    select
      c.id as conversation_id,
      (
        c.channel_is_public = true
        or exists (
          select 1
          from public.chat_conversation_members cm
          where cm.conversation_id = c.id
            and cm.user_id = (select uid from me)
        )
      ) as ok
    from public.chat_conversations c
    cross join me
    where me.uid is not null
      and c.id = p_conversation_id
      and c.closed_at is null
      and c.kind = 'channel'
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
  join access a on a.conversation_id = m.conversation_id and a.ok = true
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.reply_to_message_id is null
    and m.kind in ('text', 'system', 'image')
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

