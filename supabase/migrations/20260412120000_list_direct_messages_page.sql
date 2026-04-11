-- Постраничная загрузка личных сообщений (последние N, затем старше курсора).

create index if not exists chat_messages_convo_created_id_desc_idx
  on public.chat_messages (conversation_id, created_at desc, id desc);

create or replace function public.list_direct_messages_page(
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
  created_at timestamptz
)
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 100));
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
    join public.chat_conversation_members m on m.conversation_id = c.id
    where c.id = p_conversation_id
      and c.kind = 'direct'
      and m.user_id = v_uid
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
    x.created_at
  from (
    select
      m.id,
      m.sender_user_id,
      m.sender_name_snapshot,
      m.kind,
      m.body,
      m.created_at
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

grant execute on function public.list_direct_messages_page(uuid, int, timestamptz, uuid) to authenticated;
