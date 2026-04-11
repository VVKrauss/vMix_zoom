-- Peer-aware titles: chat_conversations.title stores the name passed at creation
-- (the opened user's display name from the creator's POV). Each viewer must see
-- the counterparty — resolve from public.users via other_user_id.

drop function if exists public.list_my_direct_conversations();

create function public.list_my_direct_conversations()
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count integer,
  unread_count integer,
  other_user_id uuid,
  other_display_name text,
  other_avatar_url text
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
  direct_conversations as (
    select
      c.id,
      c.title,
      c.created_at,
      c.last_message_at,
      c.last_message_preview,
      c.message_count,
      mm.last_read_at
    from public.chat_conversations c
    join my_membership mm
      on mm.conversation_id = c.id
    where c.kind = 'direct'
  ),
  counterpart as (
    select
      m.conversation_id,
      (array_agg(m.user_id) filter (where m.user_id <> auth.uid()))[1] as other_user_id
    from public.chat_conversation_members m
    where m.conversation_id in (select id from direct_conversations)
    group by m.conversation_id
  ),
  unread as (
    select
      dc.id as conversation_id,
      count(msg.id)::integer as unread_count
    from direct_conversations dc
    left join public.chat_messages msg
      on msg.conversation_id = dc.id
     and msg.created_at > coalesce(dc.last_read_at, to_timestamp(0))
     and coalesce(msg.sender_user_id, auth.uid()) <> auth.uid()
    group by dc.id
  )
  select
    dc.id,
    dc.title,
    dc.created_at,
    dc.last_message_at,
    dc.last_message_preview,
    dc.message_count,
    coalesce(u.unread_count, 0) as unread_count,
    cp.other_user_id,
    ou.display_name as other_display_name,
    ou.avatar_url as other_avatar_url
  from direct_conversations dc
  left join unread u
    on u.conversation_id = dc.id
  left join counterpart cp
    on cp.conversation_id = dc.id
  left join public.users ou
    on ou.id = cp.other_user_id
  order by coalesce(dc.last_message_at, dc.created_at) desc;
$$;

grant execute on function public.list_my_direct_conversations() to authenticated;
