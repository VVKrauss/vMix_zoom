-- Строки реакций в канале имеют reply_to_message_id IS NULL и попадали в list_channel_posts_page
-- вместе с постами → дубли с Realtime (reactions) и поломка toggle в UI.

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
    and m.kind in ('text', 'system', 'image')
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
