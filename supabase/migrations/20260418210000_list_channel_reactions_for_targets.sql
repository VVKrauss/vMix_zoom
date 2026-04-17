-- Реакции на посты/комменты не входят в list_channel_posts_page / list_channel_comments_page.
-- Загружаем строки kind=reaction, у которых meta.react_to указывает на один из целевых id.

create or replace function public.list_channel_reactions_for_targets(
  p_conversation_id uuid,
  p_target_ids uuid[]
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
  reply_to_message_id uuid,
  quote_to_message_id uuid
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
    m.reply_to_message_id,
    m.quote_to_message_id
  from public.chat_messages m
  cross join me
  where me.uid is not null
    and m.conversation_id = p_conversation_id
    and m.kind = 'reaction'
    and coalesce(array_length(p_target_ids, 1), 0) > 0
    and (nullif(trim(m.meta ->> 'react_to'), ''))::uuid = any (p_target_ids)
    and exists(
      select 1
      from public.chat_conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = me.uid
    );
$$;

grant execute on function public.list_channel_reactions_for_targets(uuid, uuid[]) to authenticated;
