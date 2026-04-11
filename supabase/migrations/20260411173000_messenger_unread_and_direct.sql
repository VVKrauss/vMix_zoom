create or replace function public.ensure_direct_conversation_with_user(
  p_target_user_id uuid,
  p_target_title text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_title text := nullif(left(coalesce(p_target_title, ''), 200), '');
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if p_target_user_id is null then
    raise exception 'target_user_required';
  end if;

  if p_target_user_id = v_user_id then
    return public.ensure_self_direct_conversation();
  end if;

  select c.id
    into v_conversation_id
  from public.chat_conversations c
  join public.chat_conversation_members m
    on m.conversation_id = c.id
  where c.kind = 'direct'
  group by c.id
  having count(*) = 2
     and bool_or(m.user_id = v_user_id)
     and bool_or(m.user_id = p_target_user_id)
     and bool_and(m.user_id in (v_user_id, p_target_user_id))
  order by max(c.created_at) desc
  limit 1;

  if v_conversation_id is null then
    insert into public.chat_conversations (
      kind,
      title,
      created_by,
      closed_at
    )
    values (
      'direct',
      coalesce(v_title, 'Личный чат'),
      v_user_id,
      null
    )
    returning id into v_conversation_id;

    insert into public.chat_conversation_members (conversation_id, user_id, role)
    values
      (v_conversation_id, v_user_id, 'owner'),
      (v_conversation_id, p_target_user_id, 'member')
    on conflict (conversation_id, user_id) do nothing;
  elsif v_title is not null then
    update public.chat_conversations
       set title = coalesce(title, v_title)
     where id = v_conversation_id;
  end if;

  return v_conversation_id;
end;
$$;

create or replace function public.mark_direct_conversation_read(
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

create or replace function public.list_my_direct_conversations()
returns table (
  id uuid,
  title text,
  created_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  message_count integer,
  unread_count integer,
  other_user_id uuid
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
      max(case when m.user_id <> auth.uid() then m.user_id end) as other_user_id
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
    cp.other_user_id
  from direct_conversations dc
  left join unread u
    on u.conversation_id = dc.id
  left join counterpart cp
    on cp.conversation_id = dc.id
  order by coalesce(dc.last_message_at, dc.created_at) desc;
$$;

grant execute on function public.ensure_direct_conversation_with_user(uuid, text) to authenticated;
grant execute on function public.mark_direct_conversation_read(uuid) to authenticated;
grant execute on function public.list_my_direct_conversations() to authenticated;
