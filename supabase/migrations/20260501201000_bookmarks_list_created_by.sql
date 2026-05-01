-- Bookmarks: expose created_by_user_id to the client

drop function if exists public.list_message_bookmarks(uuid, integer, timestamptz);

create or replace function public.list_message_bookmarks(
  p_conversation_id uuid,
  p_limit integer default 60,
  p_before timestamptz default null
)
returns table (
  bookmark_id uuid,
  bookmark_created_at timestamptz,
  created_by_user_id uuid,
  message_id uuid,
  message_kind text,
  message_body text,
  message_created_at timestamptz,
  sender_user_id uuid,
  sender_name_snapshot text,
  edited_at timestamptz,
  reply_to_message_id uuid,
  quote_to_message_id uuid,
  meta jsonb
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select
    b.id as bookmark_id,
    b.created_at as bookmark_created_at,
    b.created_by_user_id,
    msg.id as message_id,
    msg.kind as message_kind,
    msg.body as message_body,
    msg.created_at as message_created_at,
    msg.sender_user_id,
    msg.sender_name_snapshot,
    msg.edited_at,
    msg.reply_to_message_id,
    msg.quote_to_message_id,
    msg.meta
  from public.chat_message_bookmarks b
  join public.chat_messages msg
    on msg.id = b.message_id
  where b.owner_user_id = auth.uid()
    and b.conversation_id = p_conversation_id
    and exists (
      select 1
      from public.chat_conversation_members m
      where m.conversation_id = p_conversation_id
        and m.user_id = auth.uid()
    )
    and (p_before is null or b.created_at < p_before)
  order by b.created_at desc, b.id desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
$$;

grant execute on function public.list_message_bookmarks(uuid, integer, timestamptz) to authenticated;

